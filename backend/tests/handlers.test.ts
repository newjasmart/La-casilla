import assert from "node:assert/strict";
import test from "node:test";

import type { FunctionConfig } from "../supabase/functions/_shared/config.ts";
import type { ClaimInput, ClaimResult, ContactStore, ReservationStore } from "../supabase/functions/_shared/db.ts";
import { createContactHandler } from "../supabase/functions/send-contact/handler.ts";
import { createReservationHandler } from "../supabase/functions/send-reservation/handler.ts";

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

  async createReservationRequest(values: Record<string, unknown>): Promise<{ reference: string; status: string }> {
    if (this.error) throw this.error;
    this.inserted.push(values);
    return { reference: "LC-ABCDEF123456", status: "requested" };
  }
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

test("reservation normal path stores once and sends client and owner emails", async () => {
  const store = new MockReservationStore();
  const emails: unknown[] = [];
  const response = await createReservationHandler({
    config, store, sendEmail: async (email) => { emails.push(email); },
  })(request(reservationBody));

  assert.equal(response.status, 200);
  const responseBody = await body(response);
  assert.deepEqual(responseBody, { ok: true, reference: "LC-ABCDEF123456", status: "requested" });
  assert.equal(store.inserted.length, 1);
  assert.equal(store.inserted[0].p_adults, 2);
  assert.equal(store.inserted[0].p_children, 1);
  assert.equal("room_id" in store.inserted[0], false);
  assert.equal(emails.length, 2);
  assert.equal(store.completions.length, 1);
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
    const response = await createReservationHandler({
      config, store, sendEmail: async () => { sends += 1; },
    })(request(reservationBody));
    assert.equal(response.status, claim.outcome === "conflict" ? 409 : claim.outcome === "rate_limited" ? 429 : 200);
    assert.equal(store.inserted.length, 0);
    assert.equal(sends, 0);
  }
});

test("reservation honeypot returns generic success without row or email work", async () => {
  const store = new MockReservationStore();
  let sends = 0;
  const response = await createReservationHandler({
    config, store, sendEmail: async () => { sends += 1; },
  })(request({ ...reservationBody, website: "spam.example", email: 42 }));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { ok: true });
  assert.equal(store.inserted.length, 0);
  assert.equal(sends, 0);
});

test("reservation unavailable path returns 409 without row or email duplication", async () => {
  const store = new MockReservationStore();
  store.error = new Error("create reservation: STAY_NOT_AVAILABLE (23P01)");
  let sends = 0;
  const response = await createReservationHandler({
    config, store, sendEmail: async () => { sends += 1; },
  })(request(reservationBody));
  assert.equal(response.status, 409);
  assert.equal(store.inserted.length, 0);
  assert.equal(sends, 0);
  assert.equal(store.completions[0].status, 409);
});
