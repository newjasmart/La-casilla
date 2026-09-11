import assert from "node:assert/strict";
import test from "node:test";

import type { FunctionConfig } from "../supabase/functions/_shared/config.ts";
import type {
  ClaimInput, ClaimResult, ContactStore, PaymentIntentRecord, PaymentReservationLookup, PaymentStore, ReservationStore,
} from "../supabase/functions/_shared/db.ts";
import { createContactHandler } from "../supabase/functions/send-contact/handler.ts";
import { createReservationHandler, type ReservationDependencies } from "../supabase/functions/send-reservation/handler.ts";
import type { StripeConfig } from "../supabase/functions/_shared/stripe.ts";

const origin = "https://lacasillacasarural.com";
const config: FunctionConfig = {
  casa: {
    nom: "La Casilla", telefon: "+34 600", adreca: "Carrer 1",
    web: origin, from: "La Casilla <reserves@lacasillacasarural.com>", owner: "owner@example.test",
  },
  allowedOrigins: [origin, "https://www.lacasillacasarural.com"],
  hashSecret: "a-secure-test-secret-with-32-characters",
  rateLimitMax: 5,
  rateLimitWindowSeconds: 3600,
  emailDeliveryMode: "live",
};

const contactBody = {
  nom: "Maria", email: "maria@example.com", telefon: "600000000",
  assumpte: "Consulta", missatge: "Voldria informació.", locale: "ca",
  privacy_notice_accepted: true, website: "",
};
const reservationBody = {
  nom: "Maria", cognoms: "Serra", email: "maria@example.com", telefon: "600000000",
  data_arribada: "2027-09-01", data_sortida: "2027-09-03",
  adults: 2, infants: 1, bebes: 0, comentaris: "Gràcies", locale: "ca",
  privacy_notice_accepted: true, website: "",
};

function request(body: unknown, key = "request-key-123", requestOrigin = origin, method = "POST") {
  return new Request("https://functions.example.test/form", {
    method,
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      "idempotency-key": key,
      "x-forwarded-for": "203.0.113.10",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

class MockRequestStore {
  claims: ClaimResult[] = [{ outcome: "claimed" }];
  claimInputs: ClaimInput[] = [];
  completions: Array<{ status: number; body: unknown }> = [];
  /** Set to make completeRequest throw — exercises the handler's top-level safety net. */
  completeError: Error | null = null;

  async claimRequest(input: ClaimInput): Promise<ClaimResult> {
    this.claimInputs.push(input);
    return this.claims.shift() ?? { outcome: "claimed" };
  }

  async completeRequest(
    _endpoint: "contact" | "reservation",
    _keyHash: string,
    _fingerprint: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    if (this.completeError) throw this.completeError;
    this.completions.push({ status, body });
  }
}

class MockContactStore extends MockRequestStore implements ContactStore {
  inserted: Record<string, unknown>[] = [];
  async insertContact(values: Record<string, unknown>): Promise<unknown> {
    this.inserted.push(values);
    return { id: "contact-1", ...values };
  }
}

class MockReservationStore extends MockRequestStore implements ReservationStore {
  inserted: Record<string, unknown>[] = [];
  error: Error | null = null;

  async createReservationRequest(values: Record<string, unknown>) {
    if (this.error) throw this.error;
    this.inserted.push(values);
    return {
      reservationId: "22222222-2222-2222-2222-222222222222",
      reference: "LC-ABCDEF123456",
      status: "requested",
      totalAmount: 450,
      currency: "EUR",
    };
  }
}

// --- Automatic-payment dependencies for send-reservation ------------------
// The reservation flow starts a Stripe Checkout Session itself right after
// creating the row (see _shared/payment-flow.ts) — these mocks make that
// succeed by default so tests that aren't specifically about payment don't
// have to think about it; startOrResumePaymentError below is available for
// tests that want to force the automatic path to fail instead.

const stripeConfig: StripeConfig = {
  secretKey: "sk_test_fake", webhookSecret: "whsec_test_fake", feePercent: 1.5, feeFixed: 0.25,
};

class MockPaymentStore implements PaymentStore {
  paymentPendingCalls: string[] = [];
  holdExtensions: string[] = [];

  async fetchReservationAsCaller(): Promise<PaymentReservationLookup | null> { return null; }

  async insertOrGetPaymentIntent(): Promise<{ record: PaymentIntentRecord; created: boolean }> {
    return { created: true, record: { id: "pi-1", externalReference: null, status: "created" } };
  }

  async setPaymentIntentExternalReference(): Promise<void> {}

  async markReservationPaymentPending(reservationId: string): Promise<void> {
    this.paymentPendingCalls.push(reservationId);
  }

  async extendPaymentHold(reservationId: string): Promise<void> {
    this.holdExtensions.push(reservationId);
  }
}

function reservationDeps(overrides: Partial<ReservationDependencies> & { store: ReservationStore }): ReservationDependencies {
  return {
    config,
    stripeConfig,
    paymentStore: new MockPaymentStore(),
    createCheckoutSession: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" }),
    retrieveCheckoutSession: async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123", status: "open", paymentStatus: "unpaid" }),
    sendEmail: async () => {},
    ...overrides,
  };
}

async function body(response: Response): Promise<any> {
  return response.json();
}

test("CORS is request-aware and preflight permits Idempotency-Key", async () => {
  const store = new MockContactStore();
  const handler = createContactHandler({ config, store, sendEmail: async () => {} });

  const forbidden = await handler(request(contactBody, "request-key-123", "https://evil.example"));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get("access-control-allow-origin"), null);
  assert.equal(store.claimInputs.length, 0);

  const preflight = await handler(request(null, "request-key-123", origin, "OPTIONS"));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.match(preflight.headers.get("access-control-allow-headers")!, /idempotency-key/);
});

test("POST requires a valid Idempotency-Key before database work", async () => {
  const store = new MockContactStore();
  const handler = createContactHandler({ config, store, sendEmail: async () => {} });
  const response = await handler(request(contactBody, "short"));
  assert.equal(response.status, 400);
  assert.equal(store.claimInputs.length, 0);
});

test("contact normal path stores once, emails once, and stores only salted hashes", async () => {
  const store = new MockContactStore();
  const emails: unknown[] = [];
  const handler = createContactHandler({ config, store, sendEmail: async (email) => { emails.push(email); } });
  const response = await handler(request(contactBody));

  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true });
  assert.equal(store.inserted.length, 1);
  assert.equal(store.inserted[0].privacy_notice_accepted_at instanceof String, false);
  assert.equal("nom" in store.inserted[0], false);
  assert.equal(emails.length, 1);
  assert.match(store.claimInputs[0].clientHash, /^[a-f0-9]{64}$/);
  assert.match(store.claimInputs[0].keyHash, /^[a-f0-9]{64}$/);
  assert.notEqual(store.claimInputs[0].clientHash, "203.0.113.10");
  assert.equal(store.completions.length, 1);
});

test("contact replay, conflict, and rate limit never insert or email", async () => {
  for (const claim of [
    { outcome: "replay", responseStatus: 200, responseBody: { ok: true } },
    { outcome: "conflict" },
    { outcome: "rate_limited", responseStatus: 429, responseBody: { error: "Massa peticions" } },
  ] as ClaimResult[]) {
    const store = new MockContactStore();
    store.claims = [claim];
    let sends = 0;
    const response = await createContactHandler({
      config, store, sendEmail: async () => { sends += 1; },
    })(request(contactBody));
    assert.equal(response.status, claim.outcome === "conflict" ? 409 : claim.outcome === "rate_limited" ? 429 : 200);
    assert.equal(store.inserted.length, 0);
    assert.equal(sends, 0);
  }
});

test("contact honeypot returns generic success without storing or emailing", async () => {
  const store = new MockContactStore();
  let sends = 0;
  const response = await createContactHandler({
    config, store, sendEmail: async () => { sends += 1; },
  })(request({ ...contactBody, website: "spam.example", nom: "x" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true });
  assert.equal(store.inserted.length, 0);
  assert.equal(sends, 0);
});

test("contact: an unexpected error anywhere in the pipeline is logged and returns a clean 500", async () => {
  const store = new MockContactStore();
  store.completeError = new Error("connection terminated unexpectedly");
  const logs: Array<{ message: string; error: unknown }> = [];
  const response = await createContactHandler({
    config, store, sendEmail: async () => {},
    logError: (message, error) => logs.push({ message, error }),
  })(request(contactBody));

  assert.equal(response.status, 500);
  assert.deepEqual(await body(response), {
    error: "S'ha produït un error inesperat. Torneu-ho a provar d'aquí a uns instants.",
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0].message, /error inesperat/i);
  assert.equal((logs[0].error as Error).message, "connection terminated unexpectedly");
});

test("reservation normal path is paid automatically: one session, guest and owner both emailed", async () => {
  const store = new MockReservationStore();
  const paymentStore = new MockPaymentStore();
  const emails: unknown[] = [];
  const response = await createReservationHandler(reservationDeps({
    store, paymentStore, sendEmail: async (email) => { emails.push(email); },
  }))(request(reservationBody));

  assert.equal(response.status, 200);
  const responseBody = await body(response);
  assert.equal(responseBody.ok, true);
  assert.equal(responseBody.reference, "LC-ABCDEF123456");
  assert.equal(responseBody.status, "payment_pending");
  assert.equal(responseBody.checkoutUrl, "https://checkout.stripe.com/pay/cs_test_123");
  assert.equal(responseBody.warning, undefined);
  assert.equal(store.inserted.length, 1);
  assert.equal(store.inserted[0].p_adults, 2);
  assert.equal(store.inserted[0].p_children, 1);
  assert.equal("room_id" in store.inserted[0], false);
  // One email to Marc the moment the request comes in, one to the guest with the payment link.
  assert.equal(emails.length, 2);
  assert.equal(store.completions.length, 1);
  assert.deepEqual(paymentStore.paymentPendingCalls, ["22222222-2222-2222-2222-222222222222"]);
  assert.deepEqual(paymentStore.holdExtensions, ["22222222-2222-2222-2222-222222222222"]);
});

test("reservation: if the automatic payment step fails, the request is still saved and the guest still hears back", async () => {
  const store = new MockReservationStore();
  const emails: unknown[] = [];
  const logs: Array<{ message: string; error: unknown }> = [];
  const response = await createReservationHandler(reservationDeps({
    store,
    sendEmail: async (email) => { emails.push(email); },
    createCheckoutSession: async () => { throw new Error("Stripe ha retornat 503: service unavailable"); },
    logError: (message, error) => logs.push({ message, error }),
  }))(request(reservationBody));

  assert.equal(response.status, 200);
  const responseBody = await body(response);
  assert.equal(responseBody.ok, true);
  assert.equal(responseBody.status, "requested"); // never made it to payment_pending
  assert.equal(typeof responseBody.warning, "string");
  // Falls back to the old "we've received your request" guest email, plus the owner notification.
  assert.equal(emails.length, 2);
  assert.ok(logs.some((log) => /pagament automàtic/i.test(log.message)));
});

test("reservation: still works with no Stripe configured at all (e.g. before Marc has an account)", async () => {
  const store = new MockReservationStore();
  const emails: unknown[] = [];
  const deps = reservationDeps({ store, sendEmail: async (email) => { emails.push(email); } });
  // Simulates send-reservation/index.ts's real fallback: no stripeConfig/paymentStore at all,
  // not just a failing call — this must never crash the reservation itself.
  delete (deps as Partial<typeof deps>).stripeConfig;
  delete (deps as Partial<typeof deps>).paymentStore;

  const response = await createReservationHandler(deps)(request(reservationBody));

  assert.equal(response.status, 200);
  const responseBody = await body(response);
  assert.equal(responseBody.ok, true);
  assert.equal(responseBody.status, "requested");
  assert.equal(emails.length, 2);
});

test("reservation replay, conflict, and rate limit do not query, insert, or email", async () => {
  for (const claim of [
    { outcome: "replay", responseStatus: 200, responseBody: { ok: true, reference: "LC-ABCDEF123456", status: "requested" } },
    { outcome: "conflict" },
    { outcome: "rate_limited", responseStatus: 429, responseBody: { error: "Massa peticions" } },
  ] as ClaimResult[]) {
    const store = new MockReservationStore();
    store.claims = [claim];
    let sends = 0;
    const response = await createReservationHandler(reservationDeps({
      store, sendEmail: async () => { sends += 1; },
    }))(request(reservationBody));
    assert.equal(response.status, claim.outcome === "conflict" ? 409 : claim.outcome === "rate_limited" ? 429 : 200);
    assert.equal(store.inserted.length, 0);
    assert.equal(sends, 0);
  }
});

test("reservation honeypot returns generic success without row or email work", async () => {
  const store = new MockReservationStore();
  let sends = 0;
  const response = await createReservationHandler(reservationDeps({
    store, sendEmail: async () => { sends += 1; },
  }))(request({ ...reservationBody, website: "spam.example", email: 42 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true });
  assert.equal(store.inserted.length, 0);
  assert.equal(sends, 0);
});

test("reservation unavailable path returns 409 without row or email duplication", async () => {
  const store = new MockReservationStore();
  store.error = new Error("create reservation: STAY_NOT_AVAILABLE (23P01)");
  let sends = 0;
  const response = await createReservationHandler(reservationDeps({
    store, sendEmail: async () => { sends += 1; },
  }))(request(reservationBody));
  assert.equal(response.status, 409);
  assert.equal(store.inserted.length, 0);
  assert.equal(sends, 0);
  assert.equal(store.completions[0].status, 409);
});

test("reservation: an unexpected error anywhere in the pipeline is logged and returns a clean 500", async () => {
  const store = new MockReservationStore();
  // Not one of the specifically-handled failure points (validation, claim,
  // create, email) — this simulates a bug or outage nobody anticipated,
  // e.g. completeRequest's own DB write failing. Payment itself succeeds
  // here (default mocks), isolating this test to that one failure.
  store.completeError = new Error("connection terminated unexpectedly");
  const logs: Array<{ message: string; error: unknown }> = [];
  const response = await createReservationHandler(reservationDeps({
    store,
    logError: (message, error) => logs.push({ message, error }),
  }))(request(reservationBody));

  assert.equal(response.status, 500);
  assert.deepEqual(await body(response), {
    error: "S'ha produït un error inesperat. Torneu-ho a provar d'aquí a uns instants.",
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0].message, /error inesperat/i);
  assert.equal((logs[0].error as Error).message, "connection terminated unexpectedly");
});

test("reservation: an unexpected error without a logError dependency still returns a clean 500", async () => {
  const store = new MockReservationStore();
  store.completeError = new Error("boom");
  const response = await createReservationHandler(reservationDeps({ store }))(
    request(reservationBody),
  );
  assert.equal(response.status, 500);
});
