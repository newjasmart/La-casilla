import { getSupabasePublicConfig } from "@/lib/env";
import { createIdempotencyKey, mapStatusToRequestError } from "@/lib/request-errors";

export { RequestError as ContactRequestError, type RequestErrorCode as ContactErrorCode } from "@/lib/request-errors";

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

export function createContactRequestKey(): string {
  return createIdempotencyKey("contact");
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
    throw mapStatusToRequestError(response.status, payload);
  }

  return payload ?? { ok: true };
}
