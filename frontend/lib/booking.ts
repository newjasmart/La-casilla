import { getSupabasePublicConfig } from "@/lib/env";
import { supabaseFetch } from "@/lib/supabase";

export interface StaySelection {
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  infants: number;
}

export interface StayQuote {
  available: boolean;
  arrival_date: string;
  departure_date: string;
  nights: number;
  minimum_nights: number;
  currency: "EUR";
  nightly_subtotal: number;
  fees_total: number;
  discount_total: number;
  total_amount: number;
  nightly_lines: unknown[];
  fee_lines: unknown[];
}

export interface ReservationRequest extends StaySelection {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  privacyAccepted: boolean;
  website: string;
}

export interface ReservationResponse {
  ok: boolean;
  reference?: string;
  status?: string;
  warning?: string;
  error?: string;
}

function rpcBody(selection: StaySelection): string {
  return JSON.stringify({
    p_arrival: selection.arrival,
    p_departure: selection.departure,
    p_adults: selection.adults,
    p_children: selection.children,
    p_infants: selection.infants,
  });
}

export async function getStayQuote(selection: StaySelection): Promise<StayQuote> {
  return supabaseFetch<StayQuote>("/rest/v1/rpc/calculate_stay_quote", {
    method: "POST",
    body: rpcBody(selection),
  });
}

export function createReservationKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `reservation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function backendMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = Reflect.get(payload, "error");
  return typeof error === "string" && error.trim() ? error : fallback;
}

function reservationError(status: number, payload: unknown): string {
  const message = backendMessage(payload, "");
  if (status === 409) return "Aquestes dates ja no estan disponibles. Consulteu-ne unes altres.";
  if (status === 429) return "Heu fet massa intents. Espereu una estona abans de tornar-ho a provar.";
  if (status === 403) return "No s’ha pogut validar l’origen de la sol·licitud.";
  if (status === 400) return message || "Reviseu les dades del formulari.";
  return "No s’ha pogut enviar la sol·licitud de reserva.";
}

export async function sendReservationRequest(
  input: ReservationRequest,
  idempotencyKey: string,
): Promise<ReservationResponse> {
  const { url, anonKey } = getSupabasePublicConfig();
  const response = await fetch(`${url}/functions/v1/send-reservation`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      nom: input.firstName,
      cognoms: input.lastName,
      email: input.email,
      telefon: input.phone || undefined,
      data_arribada: input.arrival,
      data_sortida: input.departure,
      adults: input.adults,
      infants: input.children,
      bebes: input.infants,
      comentaris: input.message || undefined,
      locale: "ca",
      privacy_notice_accepted: input.privacyAccepted,
      website: input.website,
    }),
  });

  const payload = await response.json().catch(() => null) as ReservationResponse | null;
  if (!response.ok) {
    throw new Error(reservationError(response.status, payload));
  }

  return payload ?? { ok: true };
}
