// Thin Stripe REST client — same philosophy as resend.ts: no SDK dependency,
// just fetch and the documented HTTP API. Two things only: create a Checkout
// Session (create-payment-link) and verify a webhook signature (stripe-webhook).
import type { EnvReader } from "./config.ts";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

function required(env: EnvReader, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new Error(`Falta la variable d'entorn ${name}`);
  return value;
}

export function loadStripeConfig(env: EnvReader): StripeConfig {
  const secretKey = required(env, "STRIPE_SECRET_KEY");
  if (!/^sk_(test|live)_/.test(secretKey)) {
    throw new Error("STRIPE_SECRET_KEY no té l'aspecte d'una clau secreta de Stripe (sk_test_… / sk_live_…)");
  }
  return {
    secretKey,
    webhookSecret: required(env, "STRIPE_WEBHOOK_SECRET"),
  };
}

const STRIPE_API = "https://api.stripe.com/v1";

/**
 * Stripe's API takes application/x-www-form-urlencoded with bracket-style
 * keys for nested objects/arrays (line_items[0][price_data][currency]=eur),
 * not JSON. This flattens a plain params object into that shape.
 */
function toFormEntries(params: Record<string, unknown>, prefix = ""): [string, string][] {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        const indexedKey = `${fullKey}[${index}]`;
        if (item && typeof item === "object") entries.push(...toFormEntries(item as Record<string, unknown>, indexedKey));
        else entries.push([indexedKey, String(item)]);
      });
    } else if (typeof value === "object") {
      entries.push(...toFormEntries(value as Record<string, unknown>, fullKey));
    } else {
      entries.push([fullKey, String(value)]);
    }
  }
  return entries;
}

export interface CheckoutSessionInput {
  /** Major currency units (e.g. euros) — converted to the minor unit Stripe expects. */
  amount: number;
  currency: string;
  productName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  reservationId: string;
  /** Passed as Stripe's own Idempotency-Key header — a retry with the same key never creates a second session. */
  idempotencyKey: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  config: StripeConfig,
  fetcher: typeof fetch = fetch,
): Promise<CheckoutSession> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("L'import del pagament ha de ser un número positiu");
  }
  const params = {
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: Math.round(input.amount * 100),
        product_data: { name: input.productName },
      },
    }],
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { reservation_id: input.reservationId },
    payment_intent_data: { metadata: { reservation_id: input.reservationId } },
  };

  const response = await fetcher(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: new URLSearchParams(toFormEntries(params)),
  });

  if (!response.ok) {
    const text = (await response.text()).slice(0, 1000);
    throw new Error(`Stripe ha retornat ${response.status}: ${text}`);
  }
  const data = await response.json() as { id?: string; url?: string | null };
  if (!data.id || !data.url) throw new Error("Stripe no ha retornat una sessió de pagament vàlida");
  return { id: data.id, url: data.url };
}

export interface CheckoutSessionStatus {
  id: string;
  url: string | null;
  status: string;
  paymentStatus: string;
}

/** Used to re-fetch an existing session's URL — e.g. re-sending a payment link — without minting a duplicate. */
export async function retrieveCheckoutSession(
  sessionId: string,
  config: StripeConfig,
  fetcher: typeof fetch = fetch,
): Promise<CheckoutSessionStatus> {
  const response = await fetcher(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 1000);
    throw new Error(`Stripe ha retornat ${response.status}: ${text}`);
  }
  const data = await response.json() as { id: string; url: string | null; status: string; payment_status: string };
  return { id: data.id, url: data.url, status: data.status, paymentStatus: data.payment_status };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies Stripe's `Stripe-Signature` header per Stripe's documented scheme:
 * HMAC-SHA256 of `{timestamp}.{rawBody}` using the webhook signing secret,
 * with a tolerance window against replay. MUST run against the raw request
 * body (before any JSON.parse) — the signature covers the exact bytes sent.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds = 300,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts: Record<string, string> = {};
  for (const segment of signatureHeader.split(",")) {
    const [key, value] = segment.split("=");
    if (key && value) parts[key] = value;
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;

  const ageSeconds = Math.abs(nowMs / 1000 - Number(timestamp));
  if (ageSeconds > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqualHex(expected, signature);
}
