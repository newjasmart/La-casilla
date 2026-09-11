import type { WebhookStore } from "../_shared/db.ts";
import { jsonResponse } from "../_shared/http.ts";
import { verifyStripeSignature, type StripeConfig } from "../_shared/stripe.ts";

const PROVIDER = "stripe";

export interface WebhookDependencies {
  stripeConfig: StripeConfig;
  store: WebhookStore;
  verifySignature: typeof verifyStripeSignature;
  logError?(message: string, error: unknown): void;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function createStripeWebhookHandler(deps: WebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    // Safety net: see the identical comment in send-reservation/handler.ts.
    // Here it matters even more — Stripe retries a webhook that doesn't
    // return 2xx, so an unlogged crash would repeat silently for hours.
    try {
      return await handleWebhookRequest(request, deps);
    } catch (error) {
      deps.logError?.("Error inesperat processant el webhook de Stripe", error);
      return jsonResponse({ error: "Error intern" }, 500);
    }
  };
}

async function handleWebhookRequest(request: Request, deps: WebhookDependencies): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Mètode no permès" }, 405);

  // MUST read as raw text and verify BEFORE any JSON.parse — the signature
  // covers the exact bytes Stripe sent, not a re-serialized version of them.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");
  const validSignature = await deps.verifySignature(rawBody, signatureHeader, deps.stripeConfig.webhookSecret);
  if (!validSignature) {
    deps.logError?.("Signatura de Stripe no vàlida o absent", { signatureHeader });
    return jsonResponse({ error: "Signatura no vàlida" }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Cos JSON no vàlid" }, 400);
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleSessionCompleted(event, deps);
      break;
    case "checkout.session.expired":
      await handleSessionExpired(event, deps);
      break;
    default:
      // Deliberately quiet: Stripe sends many event types we don't act on
      // (e.g. charge.succeeded fires alongside checkout.session.completed).
      // Returning 200 for them stops Stripe retrying events we'll never handle.
      break;
  }

  return jsonResponse({ received: true }, 200);
}

async function handleSessionCompleted(event: StripeEvent, deps: WebhookDependencies): Promise<void> {
  const session = event.data.object;
  const sessionId = session.id as string;
  const intent = await deps.store.findPaymentIntentByExternalReference(PROVIDER, sessionId);
  if (!intent) {
    deps.logError?.("checkout.session.completed sense intenció de pagament coneguda", { sessionId });
    return;
  }
  if (intent.status === "paid") return; // Stripe may send the same event more than once.

  await deps.store.markPaymentIntentStatus(intent.id, "paid");
  try {
    await deps.store.transitionReservation(intent.reservationId, "confirmed");
  } catch (error) {
    // The reservation may have been cancelled by an admin while the guest
    // was paying. The money still arrived — that always gets recorded
    // above — but flag this loudly: it needs a human to sort out (refund
    // via the Stripe dashboard, or un-cancel the reservation).
    deps.logError?.(
      `PAGAMENT REBUT PERÒ NO S'HA POGUT CONFIRMAR LA RESERVA ${intent.reservationId} — cal revisar-ho manualment`,
      error,
    );
  }
}

async function handleSessionExpired(event: StripeEvent, deps: WebhookDependencies): Promise<void> {
  const session = event.data.object;
  const sessionId = session.id as string;
  const intent = await deps.store.findPaymentIntentByExternalReference(PROVIDER, sessionId);
  if (!intent || intent.status === "paid") return;
  await deps.store.markPaymentIntentStatus(intent.id, "failed");
}
