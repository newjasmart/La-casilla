import { getSupabasePublicConfig } from "@/lib/env";

export interface ContactRequest {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  privacyAccepted: boolean;
  website: string;
  locale: string;
}

export interface ContactResponse {
  ok: boolean;
  warning?: string;
  error?: string;
}

export type ContactErrorCode = "conflict" | "rateLimited" | "forbidden" | "validation" | "sendFailed";

export class ContactRequestError extends Error {
  constructor(readonly code: ContactErrorCode, message: string) {
    super(message);
    this.name = "ContactRequestError";
  }
}

export function createContactRequestKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function contactError(status: number, payload: unknown): ContactRequestError {
  const backendText = payload && typeof payload === "object"
    ? Reflect.get(payload, "error")
    : undefined;
  const detail = typeof backendText === "string" ? backendText : "";
  if (status === 429) return new ContactRequestError("rateLimited", detail);
  if (status === 403) return new ContactRequestError("forbidden", detail);
  if (status === 409) return new ContactRequestError("conflict", detail);
  if (status === 400) return new ContactRequestError("validation", detail);
  return new ContactRequestError("sendFailed", detail);
}

export async function sendContactRequest(
  input: ContactRequest,
  idempotencyKey: string,
): Promise<ContactResponse> {
  const { url, anonKey } = getSupabasePublicConfig();
  const response = await fetch(`${url}/functions/v1/send-contact`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      nom: input.name,
      email: input.email,
      telefon: input.phone || undefined,
      assumpte: input.subject || undefined,
      missatge: input.message,
      locale: input.locale,
      privacy_notice_accepted: input.privacyAccepted,
      website: input.website,
    }),
  });

  const payload = await response.json().catch(() => null) as ContactResponse | null;
  if (!response.ok) {
    throw contactError(response.status, payload);
  }

  return payload ?? { ok: true };
}
