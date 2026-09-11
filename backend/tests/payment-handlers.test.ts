import assert from "node:assert/strict";
import test from "node:test";

import type { FunctionConfig } from "../supabase/functions/_shared/config.ts";
import type { PaymentIntentRecord, PaymentReservationLookup, PaymentStore, WebhookStore } from "../supabase/functions/_shared/db.ts";
import { verifyStripeSignature, type CheckoutSession, type CheckoutSessionStatus, type StripeConfig } from "../supabase/functions/_shared/stripe.ts";
import { createPaymentLinkHandler } from "../supabase/functions/create-payment-link/handler.ts";
import { createStripeWebhookHandler } from "../supabase/functions/stripe-webhook/handler.ts";

const origin = "https://lacasillacasarural.com";
const config: FunctionConfig = {
  casa: {
    nom: "La Casilla", telefon: "+34 600", adreca: "Carrer 1",
    web: origin, from: "La Casilla <reserves@lacasillacasarural.com>", owner: "owner@example.test",
  },
  allowedOrigins: [origin],
  hashSecret: "a-secure-test-secret-with-32-characters",
  rateLimitMax: 5,
  rateLimitWindowSeconds: 3600,
  emailDeliveryMode: "live",
};
const stripeConfig: StripeConfig = {
  secretKey: "sk_test_fake", webhookSecret: "whsec_test_fake_secret", feePercent: 1.5, feeFixed: 0.25,
};

const baseReservation: PaymentReservationLookup = {
  id: "11111111-1111-1111-1111-111111111111",
  publicReference: "LC-ABCDEF123456",
  status: "requested",
  email: "maria@example.com",
  firstName: "Maria",
  locale: "ca",
  totalAmount: 450,
  currency: "EUR",
};

class MockPaymentStore implements PaymentStore {
  reservation: PaymentReservationLookup | null = baseReservation;
  existing: { record: PaymentIntentRecord; created: boolean } | null = null;
  inserted: unknown[] = [];
  externalReferenceUpdates: Array<{ id: string; externalReference: string }> = [];
  paymentPendingCalls: string[] = [];

  async fetchReservationAsCaller() { return this.reservation; }

  async insertOrGetPaymentIntent(input: Parameters<PaymentStore["insertOrGetPaymentIntent"]>[0]) {
    this.inserted.push(input);
    if (this.existing) return this.existing;
    return { created: true, record: { id: "pi-1", externalReference: null, status: "created" } };
  }

  async setPaymentIntentExternalReference(id: string, externalReference: string) {
    this.externalReferenceUpdates.push({ id, externalReference });
  }

  async markReservationPaymentPending(reservationId: string) {
    this.paymentPendingCalls.push(reservationId);
  }

  holdExtensions: Array<{ reservationId: string; holdMinutes: number }> = [];
  async extendPaymentHold(reservationId: string, holdMinutes: number) {
    this.holdExtensions.push({ reservationId, holdMinutes });
  }
}

function request(body: unknown, requestOrigin = origin, headers: Record<string, string> = {}) {
  return new Request("https://functions.example.test/create-payment-link", {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json", authorization: "Bearer staff-token", ...headers },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<any> {
  return response.json();
}

function buildHandler(overrides: Partial<{
  store: PaymentStore;
  sendEmail: (payload: unknown) => Promise<void>;
  createCheckoutSession: (...args: unknown[]) => Promise<CheckoutSession>;
  retrieveCheckoutSession: (...args: unknown[]) => Promise<CheckoutSessionStatus>;
  logError: (message: string, error: unknown) => void;
}> = {}) {
  const store = overrides.store ?? new MockPaymentStore();
  return createPaymentLinkHandler({
    config,
    stripeConfig,
    store,
    sendEmail: (overrides.sendEmail as any) ?? (async () => {}),
    createCheckoutSession: (overrides.createCheckoutSession as any)
      ?? (async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" })),
    retrieveCheckoutSession: (overrides.retrieveCheckoutSession as any)
      ?? (async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123", status: "open", paymentStatus: "unpaid" })),
    logError: overrides.logError,
  });
}

test("create-payment-link: happy path creates a session, marks payment_pending, and emails the guest", async () => {
  const store = new MockPaymentStore();
  const emails: unknown[] = [];
  const handler = buildHandler({ store, sendEmail: async (p) => { emails.push(p); } });

  const response = await handler(request({ reservationId: baseReservation.id }));
  const payload = await body(response);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.checkoutUrl, "https://checkout.stripe.com/pay/cs_test_123");
  assert.equal(store.paymentPendingCalls[0], baseReservation.id);
  assert.equal(store.externalReferenceUpdates[0].externalReference, "cs_test_123");
  assert.equal(emails.length, 1);
});

test("create-payment-link: unknown or non-staff caller gets a 404, not a hint about which", async () => {
  const store = new MockPaymentStore();
  store.reservation = null;
  const handler = buildHandler({ store });

  const response = await handler(request({ reservationId: baseReservation.id }));
  assert.equal(response.status, 404);
});

test("create-payment-link: a reservation that's already confirmed is rejected", async () => {
  const store = new MockPaymentStore();
  store.reservation = { ...baseReservation, status: "confirmed" };
  const handler = buildHandler({ store });

  const response = await handler(request({ reservationId: baseReservation.id }));
  assert.equal(response.status, 409);
});

test("create-payment-link: a reservation already paid is rejected without creating a new session", async () => {
  const store = new MockPaymentStore();
  store.existing = { created: false, record: { id: "pi-1", externalReference: "cs_old", status: "paid" } };
  let sessionsCreated = 0;
  const handler = buildHandler({ store, createCheckoutSession: async () => { sessionsCreated += 1; return { id: "x", url: "https://x" }; } });

  const response = await handler(request({ reservationId: baseReservation.id }));
  assert.equal(response.status, 409);
  assert.equal(sessionsCreated, 0);
});

test("create-payment-link: retrying re-uses an already-open Stripe session instead of minting a duplicate", async () => {
  const store = new MockPaymentStore();
  store.existing = { created: false, record: { id: "pi-1", externalReference: "cs_existing", status: "pending" } };
  let sessionsCreated = 0;
  const handler = buildHandler({
    store,
    createCheckoutSession: async () => { sessionsCreated += 1; return { id: "should-not-happen", url: "https://x" }; },
    retrieveCheckoutSession: async () => ({ id: "cs_existing", url: "https://checkout.stripe.com/pay/cs_existing", status: "open", paymentStatus: "unpaid" }),
  });

  const response = await handler(request({ reservationId: baseReservation.id }));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.checkoutUrl, "https://checkout.stripe.com/pay/cs_existing");
  assert.equal(sessionsCreated, 0);
});

test("create-payment-link: an expired existing session gets replaced by a fresh one", async () => {
  const store = new MockPaymentStore();
  store.existing = { created: false, record: { id: "pi-1", externalReference: "cs_expired", status: "pending" } };
  const handler = buildHandler({
    store,
    createCheckoutSession: async () => ({ id: "cs_fresh", url: "https://checkout.stripe.com/pay/cs_fresh" }),
    retrieveCheckoutSession: async () => ({ id: "cs_expired", url: null, status: "expired", paymentStatus: "unpaid" }),
  });

  const response = await handler(request({ reservationId: baseReservation.id }));
  const payload = await body(response);
  assert.equal(payload.checkoutUrl, "https://checkout.stripe.com/pay/cs_fresh");
  assert.equal(store.externalReferenceUpdates[0].externalReference, "cs_fresh");
});

test("create-payment-link: an unexpected error is logged and returns a clean 500", async () => {
  const store = new MockPaymentStore();
  const logs: Array<{ message: string; error: unknown }> = [];
  const handler = buildHandler({
    store,
    createCheckoutSession: async () => { throw new Error("Stripe ha retornat 500: boom"); },
    logError: (message, error) => logs.push({ message, error }),
  });

  const response = await handler(request({ reservationId: baseReservation.id }));
  assert.equal(response.status, 500);
  assert.equal(logs.length, 1);
});

test("create-payment-link: rejects a malformed reservationId before touching the store", async () => {
  const store = new MockPaymentStore();
  const handler = buildHandler({ store });
  const response = await handler(request({ reservationId: "not-a-uuid" }));
  assert.equal(response.status, 400);
  assert.equal(store.inserted.length, 0);
});

// --- stripe-webhook -------------------------------------------------------

async function signedRequest(payload: unknown, secret = stripeConfig.webhookSecret, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(payload);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const signature = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://functions.example.test/stripe-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: rawBody,
  });
}

class MockWebhookStore implements WebhookStore {
  intents = new Map<string, { id: string; reservationId: string; status: string }>();
  statusUpdates: Array<{ id: string; status: string }> = [];
  transitions: Array<{ reservationId: string; status: string }> = [];
  transitionError: Error | null = null;

  async findPaymentIntentByExternalReference(_provider: string, externalReference: string) {
    return this.intents.get(externalReference) ?? null;
  }

  async markPaymentIntentStatus(id: string, status: string) {
    this.statusUpdates.push({ id, status });
    for (const intent of this.intents.values()) if (intent.id === id) intent.status = status;
  }

  async transitionReservation(reservationId: string, newStatus: string) {
    if (this.transitionError) throw this.transitionError;
    this.transitions.push({ reservationId, status: newStatus });
  }

  async getReservationSummary(_reservationId: string) {
    return {
      publicReference: baseReservation.publicReference,
      firstName: baseReservation.firstName,
      lastName: "Test",
      arrivalDate: "2027-07-10",
      departureDate: "2027-07-15",
      totalAmount: baseReservation.totalAmount,
      currency: baseReservation.currency,
    };
  }
}

test("stripe-webhook: rejects a request without a valid signature", async () => {
  const store = new MockWebhookStore();
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });
  const response = await handler(new Request("https://x/stripe-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "checkout.session.completed" }),
  }));
  assert.equal(response.status, 400);
});

test("stripe-webhook: checkout.session.completed marks the payment paid and confirms the reservation", async () => {
  const store = new MockWebhookStore();
  store.intents.set("cs_1", { id: "pi-1", reservationId: baseReservation.id, status: "pending" });
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });

  const response = await handler(await signedRequest({
    id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(store.statusUpdates, [{ id: "pi-1", status: "paid" }]);
  assert.deepEqual(store.transitions, [{ reservationId: baseReservation.id, status: "confirmed" }]);
});

test("stripe-webhook: the same event delivered twice only confirms once", async () => {
  const store = new MockWebhookStore();
  store.intents.set("cs_1", { id: "pi-1", reservationId: baseReservation.id, status: "pending" });
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });
  const event = { id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } };

  await handler(await signedRequest(event));
  const second = await handler(await signedRequest(event));

  assert.equal(second.status, 200);
  assert.equal(store.transitions.length, 1);
});

test("stripe-webhook: checkout.session.expired marks the payment failed without touching the reservation", async () => {
  const store = new MockWebhookStore();
  store.intents.set("cs_2", { id: "pi-2", reservationId: baseReservation.id, status: "pending" });
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });

  const response = await handler(await signedRequest({
    id: "evt_2", type: "checkout.session.expired", data: { object: { id: "cs_2" } },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(store.statusUpdates, [{ id: "pi-2", status: "failed" }]);
  assert.equal(store.transitions.length, 0);
});

test("stripe-webhook: payment received but the reservation can't be confirmed (e.g. cancelled) is logged loudly, not silently dropped", async () => {
  const store = new MockWebhookStore();
  store.intents.set("cs_3", { id: "pi-3", reservationId: baseReservation.id, status: "pending" });
  store.transitionError = new Error("INVALID_STATUS_TRANSITION");
  const logs: Array<{ message: string; error: unknown }> = [];
  const handler = createStripeWebhookHandler({
    casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature,
    logError: (message, error) => logs.push({ message, error }),
  });

  const response = await handler(await signedRequest({
    id: "evt_3", type: "checkout.session.completed", data: { object: { id: "cs_3" } },
  }));

  assert.equal(response.status, 200); // still 200: retrying won't fix a business-state conflict.
  assert.deepEqual(store.statusUpdates, [{ id: "pi-3", status: "paid" }]); // the money was still recorded.
  assert.equal(logs.length, 1);
  assert.match(logs[0].message, /PAGAMENT REBUT/);
});

test("stripe-webhook: an unhandled event type is acknowledged without side effects", async () => {
  const store = new MockWebhookStore();
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });
  const response = await handler(await signedRequest({ id: "evt_4", type: "charge.succeeded", data: { object: {} } }));
  assert.equal(response.status, 200);
  assert.equal(store.statusUpdates.length, 0);
});

test("stripe-webhook: a signature computed with the wrong secret is rejected", async () => {
  const store = new MockWebhookStore();
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });
  const response = await handler(await signedRequest({ id: "evt_5", type: "checkout.session.completed", data: { object: { id: "cs_1" } } }, "whsec_wrong_secret"));
  assert.equal(response.status, 400);
});

test("stripe-webhook: an old timestamp outside the replay tolerance is rejected", async () => {
  const store = new MockWebhookStore();
  const handler = createStripeWebhookHandler({ casa: config.casa, stripeConfig, store, sendEmail: async () => {}, verifySignature: verifyStripeSignature });
  const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1h old, default tolerance 300s
  const response = await handler(await signedRequest({ id: "evt_6", type: "checkout.session.completed", data: { object: { id: "cs_1" } } }, stripeConfig.webhookSecret, oldTimestamp));
  assert.equal(response.status, 400);
});

test("verifyStripeSignature: accepts a well-formed, correctly-signed payload", async () => {
  const secret = "whsec_direct_test";
  const payload = JSON.stringify({ hello: "world" });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const signature = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");

  assert.equal(await verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret), true);
  assert.equal(await verifyStripeSignature(payload, null, secret), false);
  assert.equal(await verifyStripeSignature(payload, "garbage", secret), false);
  assert.equal(await verifyStripeSignature(payload, `t=${timestamp},v1=deadbeef`, secret), false);
});
