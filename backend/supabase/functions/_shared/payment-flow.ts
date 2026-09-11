import type { FunctionConfig } from "./config.ts";
import type { PaymentStore } from "./db.ts";
import type { ResendPayload } from "./resend.ts";
import { saltedHash } from "./security.ts";
import { computeGuestChargeAmount, createCheckoutSession, retrieveCheckoutSession, type StripeConfig } from "./stripe.ts";
import { emailClientPaymentLink } from "./templates.ts";

const PROVIDER = "stripe";

// Only these reservation states may get a payment link. 'payment_pending'
// is included so retrying (guest lost the email, or the automatic attempt
// at request time failed) re-sends it instead of erroring.
const PAYABLE_STATUSES = new Set(["requested", "payment_pending"]);

// How long a Stripe Checkout Session — and the matching calendar hold —
// stays valid for. Kept in sync with properties.request_hold_minutes'
// default (1440 = 24h) rather than duplicating that number blindly; if a
// property ever configures a different hold, this still caps at Stripe's
// own 24h maximum for a Checkout Session.
const MAX_HOLD_MINUTES = 1440;

// Shown as its own Stripe Checkout line item — kept short and in the
// guest's own language rather than tucked away in fine print, so the
// surcharge is never a silent addition to the price they saw on the site.
const FEE_LABELS: Record<string, string> = {
  ca: "Despeses de gestió (pagament en línia)",
  es: "Gastos de gestión (pago en línea)",
  en: "Payment processing fee",
  nl: "Betalingskosten (online betaling)",
  fr: "Frais de gestion (paiement en ligne)",
};

function feeLabelFor(locale: string | null): string {
  const short = (locale ?? "").slice(0, 2).toLowerCase();
  return FEE_LABELS[short] ?? FEE_LABELS.ca;
}

export interface PayableReservation {
  id: string;
  publicReference: string;
  status: string;
  email: string;
  firstName: string;
  locale: string | null;
  totalAmount: number;
  currency: string;
}

export interface PaymentFlowDependencies {
  config: FunctionConfig;
  stripeConfig: StripeConfig;
  store: PaymentStore;
  sendEmail(payload: ResendPayload): Promise<void>;
  createCheckoutSession: typeof createCheckoutSession;
  retrieveCheckoutSession: typeof retrieveCheckoutSession;
  logError?(message: string, error: unknown): void;
}

export type PaymentFlowResult =
  | { ok: true; checkoutUrl: string; emailWarning?: string }
  | { ok: false; reason: "not_payable" | "already_paid"; message: string };

/**
 * Starts (or resumes) payment for a reservation: creates a Stripe Checkout
 * Session for the reservation amount plus a transparent processing-fee line,
 * refreshes the calendar hold so the dates don't get released mid-checkout,
 * marks the reservation payment_pending, and emails the guest the link.
 * Reused by both the automatic (send-reservation) and manual/admin
 * (create-payment-link) paths — see each caller for how `reservation` is
 * obtained and authorized.
 */
export async function startOrResumePayment(
  reservation: PayableReservation,
  deps: PaymentFlowDependencies,
): Promise<PaymentFlowResult> {
  if (!PAYABLE_STATUSES.has(reservation.status)) {
    return {
      ok: false,
      reason: "not_payable",
      message: `Aquesta reserva té l'estat "${reservation.status}" i no admet un enllaç de pagament`,
    };
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
    return { ok: false, reason: "already_paid", message: "Aquesta reserva ja s'ha pagat" };
  }

  let checkoutUrl: string | null = null;
  if (!created && record.externalReference) {
    // A session already exists — reuse it while still open, rather than
    // minting a duplicate Stripe session for the same reservation.
    const existingSession = await deps.retrieveCheckoutSession(record.externalReference, deps.stripeConfig);
    if (existingSession.status === "open" && existingSession.url) {
      checkoutUrl = existingSession.url;
    }
  }

  if (!checkoutUrl) {
    const { fee } = computeGuestChargeAmount(reservation.totalAmount, deps.stripeConfig);
    const expiresAt = Math.floor(Date.now() / 1000) + MAX_HOLD_MINUTES * 60;
    const session = await deps.createCheckoutSession({
      netAmount: reservation.totalAmount,
      feeAmount: fee,
      feeLabel: feeLabelFor(reservation.locale),
      currency: reservation.currency,
      productName: `Reserva La Casilla — ${reservation.publicReference}`,
      customerEmail: reservation.email,
      successUrl: `${deps.config.casa.web}/?payment=success#reserva`,
      cancelUrl: `${deps.config.casa.web}/?payment=cancelled#reserva`,
      reservationId: reservation.id,
      idempotencyKey: idempotencyKeyHash,
      expiresAt,
    }, deps.stripeConfig);
    await deps.store.setPaymentIntentExternalReference(record.id, session.id);
    checkoutUrl = session.url;
  }

  await deps.store.markReservationPaymentPending(reservation.id);
  await deps.store.extendPaymentHold(reservation.id, MAX_HOLD_MINUTES);

  let emailWarning: string | undefined;
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
    emailWarning = "L'enllaç s'ha generat però l'enviament del correu ha fallat";
  }

  return { ok: true, checkoutUrl, emailWarning };
}
