// Thin Stripe REST client — same philosophy as resend.ts: no SDK dependency,
// just fetch and the documented HTTP API. Two things only: create a Checkout
// Session (create-payment-link) and verify a webhook signature (stripe-webhook).
import type { EnvReader } from "./config.ts";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Percentage (e.g. 1.5 for 1.5%) added on top of the reservation amount so the fee doesn't eat into what the owner receives. */
  feePercent: number;
  /** Fixed fee in major currency units (e.g. 0.25 for €0.25), added alongside feePercent. */
  feeFixed: number;
}

function required(env: EnvReader, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new Error(`Falta la variable d'entorn ${name}`);
  return value;
}

function parseNonNegativeNumber(env: EnvReader, name: string, fallback: number): number {
  const raw = env.get(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} ha de ser un número >= 0`);
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
    // Defaults approximate Stripe's standard EU card rate. This is an
    // approximation, not a live lookup of the real fee Stripe will charge
    // (that depends on the guest's card country/type and isn't knowable
    // before the card is entered) — reviewed periodically against actual
    // Stripe payout statements is the honest way to keep this accurate.
    feePercent: parseNonNegativeNumber(env, "STRIPE_FEE_PERCENT", 1.5),
    feeFixed: parseNonNegativeNumber(env, "STRIPE_FEE_FIXED", 0.25),
  };
}

/**
 * Grosses up a net amount so that, after Stripe deducts a fee of
 * `feePercent`% + `feeFixed`, the owner still receives exactly `netAmount`.
 * Standard "customer pays the processing fee" formula, rounded to the cent.
 */
export function computeGuestChargeAmount(netAmount: number, config: StripeConfig): { charged: number; fee: number } {
  const charged = Math.round(((netAmount + config.feeFixed) / (1 - config.feePercent / 100)) * 100) / 100;
  const fee = Math.round((charged - netAmount) * 100) / 100;
  return { charged, fee };
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
  netAmount: number;
  /** Card-processing surcharge, shown as its own line item — never silently folded into the price. */
  feeAmount: number;
  feeLabel: string;
  currency: string;
  productName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  reservationId: string;
  /** Passed as Stripe's own Idempotency-Key header — a retry with the same key never creates a second session. */
  idempotencyKey: string;
  /** Unix seconds — kept in sync with the calendar hold so a session never outlives the dates it's paying for. */
  expiresAt: number;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

function centsOf(amount: number): number {
  return Math.round(amount * 100);
}

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  config: StripeConfig,
  fetcher: typeof fetch = fetch,
): Promise<CheckoutSession> {
  if (!Number.isFinite(input.netAmount) || input.netAmount <= 0) {
    throw new Error("L'import del pagament ha de ser un número positiu");
  }
  const lineItems: Record<string, unknown>[] = [{
    quantity: 1,
    price_data: {
      currency: input.currency.toLowerCase(),
      unit_amount: centsOf(input.netAmount),
      product_data: { name: input.productName },
    },
  }];
  if (input.feeAmount > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: centsOf(input.feeAmount),
        product_data: { name: input.feeLabel },
      },
    });
  }
  const params = {
    mode: "payment",
    line_items: lineItems,
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: input.expiresAt,
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
