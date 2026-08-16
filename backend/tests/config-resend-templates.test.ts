import assert from "node:assert/strict";
import test from "node:test";

import { ConfigError, loadFunctionConfig, type CasaConfig, type EnvReader } from "../supabase/functions/_shared/config.ts";
import { sendEmail, type ResendPayload } from "../supabase/functions/_shared/resend.ts";
import { escapeHtml } from "../supabase/functions/_shared/security.ts";
import { emailClientReserva, emailPropietariContacte, emailPropietariReserva } from "../supabase/functions/_shared/templates.ts";

const casa: CasaConfig = {
  nom: "La Casilla",
  telefon: "+34 600 000 000",
  adreca: "Carrer Principal, 1",
  web: "https://lacasillacasarural.com",
  from: "La Casilla <reserves@lacasillacasarural.com>",
  owner: "owner@example.test",
};

function env(overrides: Record<string, string | undefined> = {}): EnvReader {
  const values: Record<string, string | undefined> = {
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: casa.from,
    RESEND_OWNER_EMAIL: casa.owner,
    CASA_NOM: casa.nom,
    CASA_WEB: casa.web,
    ANTI_SPAM_HASH_SECRET: "a-secure-test-secret-with-32-characters",
    ALLOWED_ORIGINS: "https://lacasillacasarural.com,https://www.lacasillacasarural.com",
    ...overrides,
  };
  return { get: (name) => values[name] };
}

const payload: ResendPayload = {
  from: casa.from,
  to: "visitor@example.com",
  subject: "Test",
  html: "<p>Test</p>",
};

test("config accepts complete production values", () => {
  const config = loadFunctionConfig(env());
  assert.equal(config.casa.web, casa.web);
  assert.deepEqual(config.allowedOrigins, [casa.web, "https://www.lacasillacasarural.com"]);
  assert.equal(config.rateLimitMax, 5);
  assert.equal(config.emailDeliveryMode, "live");
});

test("mock email mode requires no API key and never calls fetch", async () => {
  const mockEnv = env({ EMAIL_DELIVERY_MODE: "mock", RESEND_API_KEY: "" });
  assert.equal(loadFunctionConfig(mockEnv).emailDeliveryMode, "mock");
  let called = false;
  await sendEmail(payload, {
    env: mockEnv,
    fetcher: async () => { called = true; return new Response(null, { status: 200 }); },
  });
  assert.equal(called, false);
});

test("config clearly rejects missing and unapproved values", () => {
  assert.throws(() => loadFunctionConfig(env({ RESEND_API_KEY: "" })), /RESEND_API_KEY/);
  assert.throws(() => loadFunctionConfig(env({ RESEND_OWNER_EMAIL: "" })), /RESEND_OWNER_EMAIL/);
  assert.throws(() => loadFunctionConfig(env({ RESEND_FROM_EMAIL: "sender@example.com" })), /lacasillacasarural\.com/);
  assert.throws(() => loadFunctionConfig(env({ CASA_NOM: "" })), /CASA_NOM/);
  assert.throws(() => loadFunctionConfig(env({ CASA_WEB: "https:\/\/example.com" })), /CASA_WEB/);
  assert.throws(() => loadFunctionConfig(env({ ALLOWED_ORIGINS: "*" })), /ALLOWED_ORIGINS/);
  assert.throws(() => loadFunctionConfig(env({ ANTI_SPAM_HASH_SECRET: "short" })), /32/);
  assert.throws(() => loadFunctionConfig(env({ EMAIL_DELIVERY_MODE: "sometimes" })), /mock o live/);
});

test("Resend rejects a missing API key without calling fetch", async () => {
  let called = false;
  await assert.rejects(
    sendEmail(payload, {
      env: env({ RESEND_API_KEY: "" }),
      fetcher: async () => { called = true; return new Response(null, { status: 200 }); },
    }),
    (error: unknown) => error instanceof ConfigError && /RESEND_API_KEY/.test(error.message),
  );
  assert.equal(called, false);
});

test("Resend sends the expected server-side request through mocked fetch", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  await sendEmail(payload, {
    env: env({ RESEND_API_KEY: "test-key" }),
    fetcher: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(capturedUrl, "https://api.resend.com/emails");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), payload);
});

test("Resend rejects an unapproved From address before mocked fetch", async () => {
  let called = false;
  await assert.rejects(sendEmail({ ...payload, from: "sender@example.com" }, {
    env: env({ RESEND_API_KEY: "test-key" }),
    fetcher: async () => { called = true; return new Response(null, { status: 200 }); },
  }), /lacasillacasarural\.com/);
  assert.equal(called, false);
});

test("Resend surfaces non-success responses from mocked fetch", async () => {
  await assert.rejects(
    sendEmail(payload, {
      env: env({ RESEND_API_KEY: "test-key" }),
      fetcher: async () => new Response("rejected", { status: 422 }),
    }),
    /Resend ha retornat 422: rejected/,
  );
});

test("HTML escaping handles text, attributes, and every visitor template field", () => {
  const attack = `\"><img src=x onerror=alert(1)>&'`;
  assert.equal(escapeHtml(attack), "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;");

  const reservation = {
    nom: attack, cognoms: attack, email: attack, telefon: attack,
    data_arribada: "2027-09-01", data_sortida: "2027-09-03",
    adults: 2, infants: 1, bebes: 0, reference: attack, comentaris: attack,
  };
  const client = emailClientReserva(reservation, casa);
  const owner = emailPropietariReserva(reservation, casa);
  const contact = emailPropietariContacte({
    nom: attack, email: attack, telefon: attack, assumpte: attack, missatge: attack,
  }, casa);

  for (const html of [client.html, owner.html, contact.html]) {
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x/);
  }
  assert.match(owner.html, /mailto:&quot;&gt;&lt;img/);
  assert.match(contact.html, /mailto:&quot;&gt;&lt;img/);
  assert.doesNotMatch(owner.subject, /[\r\n]/);
  assert.doesNotMatch(contact.subject, /[\r\n]/);
});
