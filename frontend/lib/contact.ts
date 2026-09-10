import { getSupabasePublicConfig } from "@/lib/env";

export interface ContactRequest {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  privacyAccepted: boolean;
  website: string;
}

export interface ContactResponse {
  ok: boolean;
  warning?: string;
  error?: string;
}

export function createContactRequestKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function backendMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = Reflect.get(payload, "error");
  return typeof error === "string" && error.trim() ? error : fallback;
}

function contactError(status: number, payload: unknown): string {
  const message = backendMessage(payload, "");
  if (status === 429) return "Heu fet massa intents. Espereu una estona abans de tornar-ho a provar.";
  if (status === 403) return "No s’ha pogut validar l’origen de la sol·licitud.";
  if (status === 409) return "Ja s’està processant aquest missatge. Espereu un moment.";
  if (status === 400) return message || "Reviseu les dades del formulari.";
  return "No s’ha pogut enviar el missatge. Torneu-ho a provar d’aquí a uns instants.";
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
      locale: "ca",
      privacy_notice_accepted: input.privacyAccepted,
      website: input.website,
    }),
  });

  const payload = await response.json().catch(() => null) as ContactResponse | null;
  if (!response.ok) {
    throw new Error(contactError(response.status, payload));
  }

  return payload ?? { ok: true };
}
