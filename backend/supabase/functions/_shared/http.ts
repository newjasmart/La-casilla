import type { FunctionConfig } from "./config.ts";
import type { ClaimResult, RequestStore } from "./db.ts";
import { requestClientIdentifier, saltedHash, stableStringify } from "./security.ts";

const CORS_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type, idempotency-key";

export function isAllowedOrigin(request: Request, origins: string[]): string | null {
  const origin = request.headers.get("origin");
  return origin && origins.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin, Access-Control-Request-Headers",
  };
}

export function jsonResponse(body: unknown, status: number, origin?: string, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(origin ? corsHeaders(origin) : {}),
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function claimResponse(claim: ClaimResult, origin: string, retryAfterSeconds: number): Response | null {
  switch (claim.outcome) {
    case "claimed": return null;
    case "replay":
      return jsonResponse(claim.responseBody, claim.responseStatus, origin, {
        "Idempotent-Replayed": "true",
        ...(claim.responseStatus === 429 ? { "Retry-After": String(retryAfterSeconds) } : {}),
      });
    case "rate_limited":
      return jsonResponse(claim.responseBody, 429, origin, { "Retry-After": String(retryAfterSeconds) });
    case "conflict":
      return jsonResponse({ error: "Aquesta Idempotency-Key ja s'ha utilitzat amb altres dades" }, 409, origin);
    case "processing":
      return jsonResponse({ error: "Ja s'està processant una petició amb aquesta Idempotency-Key" }, 409, origin);
  }
}

export async function claimFormRequest(
  request: Request,
  endpoint: "contact" | "reservation",
  idempotencyKey: string,
  normalizedBody: unknown,
  config: FunctionConfig,
  store: RequestStore,
): Promise<{ keyHash: string; fingerprint: string; response: Response | null }> {
  const [keyHash, fingerprint, clientHash] = await Promise.all([
    saltedHash(config.hashSecret, "idempotency-key", idempotencyKey),
    saltedHash(config.hashSecret, "request-fingerprint", stableStringify(normalizedBody)),
    saltedHash(config.hashSecret, "client-address", requestClientIdentifier(request)),
  ]);
  const claim = await store.claimRequest({
    endpoint,
    keyHash,
    requestFingerprint: fingerprint,
    clientHash,
    maxRequests: config.rateLimitMax,
    windowSeconds: config.rateLimitWindowSeconds,
  });
  return {
    keyHash,
    fingerprint,
    response: claimResponse(claim, request.headers.get("origin")!, config.rateLimitWindowSeconds),
  };
}

export async function completeAndRespond(
  store: RequestStore,
  endpoint: "contact" | "reservation",
  keyHash: string,
  fingerprint: string,
  body: unknown,
  status: number,
  origin: string,
): Promise<Response> {
  await store.completeRequest(endpoint, keyHash, fingerprint, status, body);
  return jsonResponse(body, status, origin);
}
