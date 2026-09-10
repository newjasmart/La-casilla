/**
 * Shared by lib/booking.ts and lib/contact.ts, which POST to their own Edge
 * Function but get back the exact same status-code vocabulary (both go
 * through claimFormRequest/completeAndRespond on the backend — see
 * backend/supabase/functions/_shared/http.ts). Kept here once instead of
 * reimplementing the same class + status-to-code mapping in both files.
 */
export type RequestErrorCode = "conflict" | "rateLimited" | "forbidden" | "validation" | "sendFailed";

export class RequestError extends Error {
  constructor(readonly code: RequestErrorCode, message: string) {
    super(message);
    this.name = "RequestError";
  }
}

export function mapStatusToRequestError(status: number, payload: unknown): RequestError {
  const backendText = payload && typeof payload === "object"
    ? Reflect.get(payload, "error")
    : undefined;
  const detail = typeof backendText === "string" ? backendText : "";
  if (status === 409) return new RequestError("conflict", detail);
  if (status === 429) return new RequestError("rateLimited", detail);
  if (status === 403) return new RequestError("forbidden", detail);
  if (status === 400) return new RequestError("validation", detail);
  return new RequestError("sendFailed", detail);
}

export function createIdempotencyKey(prefix: string): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
