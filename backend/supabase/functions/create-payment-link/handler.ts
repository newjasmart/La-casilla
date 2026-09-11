import type { FunctionConfig } from "../_shared/config.ts";
import type { PaymentStore } from "../_shared/db.ts";
import { corsHeaders, isAllowedOrigin, jsonResponse } from "../_shared/http.ts";
import { saltedHash } from "../_shared/security.ts";
import { createCheckoutSession, retrieveCheckoutSession, type StripeConfig } from "../_shared/stripe.ts";
import type { ResendPayload } from "../_shared/resend.ts";
import { emailClientPaymentLink } from "../_shared/templates.ts";

const PROVIDER = "stripe";

// Only these reservation states may get a payment link. 'payment_pending'
// is included so re-clicking the button (e.g. the guest lost the email)
// re-sends it instead of erroring.
const PAYABLE_STATUSES = new Set(["requested", "payment_pending"]);

export interface PaymentLinkInput {
  reservationId: string;
}

export interface PaymentLinkDependencies {
  config: FunctionConfig;
  stripeConfig: StripeConfig;
  store: PaymentStore;
  sendEmail(payload: ResendPayload): Promise<void>;
  createCheckoutSession: typeof createCheckoutSession;
  retrieveCheckoutSession: typeof retrieveCheckoutSession;
  logError?(message: string, error: unknown): void;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function createPaymentLinkHandler(deps: PaymentLinkDependencies) {
  return async (request: Request): Promise<Response> => {
    // Safety net: see the identical comment in send-reservation/handler.ts.
    try {
      return await handlePaymentLinkRequest(request, deps);
    } catch (error) {
      deps.logError?.("Error inesperat generant l'enllaç de pagament", error);
      const origin = request.headers.get("origin") ?? undefined;
      return jsonResponse({ error: "S'ha produït un error inesperat. Torneu-ho a provar d'aquí a uns instants." }, 500, origin);
    }
  };
}

async function handlePaymentLinkRequest(request: Request, deps: PaymentLinkDependencies): Promise<Response> {
  const origin = isAllowedOrigin(request, deps.config.allowedOrigins);
  if (!origin) return jsonResponse({ error: "Origen no permès" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "Mètode no permès" }, 405, origin);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Cos JSON no vàlid" }, 400, origin);
  }
  const reservationId = (input as Partial<PaymentLinkInput> | null)?.reservationId;
  if (!isUuid(reservationId)) {
    return jsonResponse({ error: "Cal un reservationId vàlid" }, 400, origin);
  }

  // This read is the access check: reservations_admin_read only lets a
  // staff member's own session see the row, so a non-staff caller (or an
  // unauthenticated one) simply gets nothing back here.
  const reservation = await deps.store.fetchReservationAsCaller(reservationId);
  if (!reservation) {
    return jsonResponse({ error: "Reserva no trobada o sense permisos" }, 404, origin);
  }
  if (!PAYABLE_STATUSES.has(reservation.status)) {
    return jsonResponse({ error: `Aquesta reserva té l'estat "${reservation.status}" i no admet un enllaç de pagament` }, 409, origin);
  }

  const idempotencyKeyHash = await saltedHash(deps.config.hashSecret, "payment-intent", reservation.id);
  const { record, created } = await deps.store.insertOrGetPaymentIntent({
    reservationId: reservation.id,
    provider: PROVIDER,
    amount: reservation.totalAmount,
    currency: reservation.currency,
    idempotencyKeyHash,
  });

  if (record.status === "paid") {
    return jsonResponse({ error: "Aquesta reserva ja s'ha pagat" }, 409, origin);
  }

  let checkoutUrl: string | null = null;
  if (!created && record.externalReference) {
    // A session already exists for this reservation — reuse it while it's
    // still open, rather than minting a duplicate Stripe session.
    const existingSession = await deps.retrieveCheckoutSession(record.externalReference, deps.stripeConfig);
    if (existingSession.status === "open" && existingSession.url) {
      checkoutUrl = existingSession.url;
    }
  }

  if (!checkoutUrl) {
    const session = await deps.createCheckoutSession({
      amount: reservation.totalAmount,
      currency: reservation.currency,
      productName: `Reserva La Casilla — ${reservation.publicReference}`,
      customerEmail: reservation.email,
      successUrl: `${deps.config.casa.web}/?payment=success#reserva`,
      cancelUrl: `${deps.config.casa.web}/?payment=cancelled#reserva`,
      reservationId: reservation.id,
      idempotencyKey: idempotencyKeyHash,
    }, deps.stripeConfig);
    await deps.store.setPaymentIntentExternalReference(record.id, session.id);
    checkoutUrl = session.url;
  }

  await deps.store.markReservationPaymentPending(reservation.id);

  let warning: string | undefined;
  try {
    const { subject, html } = emailClientPaymentLink({
      firstName: reservation.firstName,
      email: reservation.email,
      reference: reservation.publicReference,
      amount: reservation.totalAmount,
      currency: reservation.currency,
      checkoutUrl,
      locale: reservation.locale,
    }, deps.config.casa);
    await deps.sendEmail({ from: deps.config.casa.from, to: reservation.email, subject, html });
  } catch (error) {
    deps.logError?.("Error enviant el correu de l'enllaç de pagament", error);
    warning = "L'enllaç s'ha generat però l'enviament del correu ha fallat";
  }

  return jsonResponse({ ok: true, checkoutUrl, warning }, 200, origin);
}
