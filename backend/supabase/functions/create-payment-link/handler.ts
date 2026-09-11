import type { FunctionConfig } from "../_shared/config.ts";
import type { PaymentStore } from "../_shared/db.ts";
import { corsHeaders, isAllowedOrigin, jsonResponse } from "../_shared/http.ts";
import { startOrResumePayment } from "../_shared/payment-flow.ts";
import type { ResendPayload } from "../_shared/resend.ts";
import { createCheckoutSession, retrieveCheckoutSession, type StripeConfig } from "../_shared/stripe.ts";

/**
 * Manual/admin path: re-sends or resumes a payment link for a reservation
 * that the automatic flow (send-reservation) couldn't set up, or whose
 * link the guest lost. The actual Stripe/DB/email work is shared with that
 * automatic path — see _shared/payment-flow.ts. What's specific to *this*
 * function is the access check just below: reading the reservation through
 * the CALLER's own session means reservations_admin_read (RLS) — not our
 * own code — is what proves they're staff.
 */
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

  const result = await startOrResumePayment(reservation, deps);
  if (!result.ok) {
    return jsonResponse({ error: result.message }, 409, origin);
  }
  return jsonResponse({ ok: true, checkoutUrl: result.checkoutUrl, warning: result.emailWarning }, 200, origin);
}
