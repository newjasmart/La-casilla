import { getSupabasePublicConfig } from "@/lib/env";
import { createIdempotencyKey, mapStatusToRequestError } from "@/lib/request-errors";
import { supabaseFetch } from "@/lib/supabase";

export { RequestError as ReservationRequestError, type RequestErrorCode as ReservationErrorCode } from "@/lib/request-errors";

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
  locale: string;
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
  return createIdempotencyKey("reservation");
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
      locale: input.locale,
      privacy_notice_accepted: input.privacyAccepted,
      website: input.website,
    }),
  });

  const payload = await response.json().catch(() => null) as ReservationResponse | null;
  if (!response.ok) {
    throw mapStatusToRequestError(response.status, payload);
  }

  return payload ?? { ok: true };
}
