export type ClaimResult =
  | { outcome: "claimed" }
  | { outcome: "replay"; responseStatus: number; responseBody: unknown }
  | { outcome: "conflict" }
  | { outcome: "processing" }
  | { outcome: "rate_limited"; responseStatus: 429; responseBody: unknown };

export interface ClaimInput {
  endpoint: "contact" | "reservation";
  keyHash: string;
  requestFingerprint: string;
  clientHash: string;
  maxRequests: number;
  windowSeconds: number;
}

export interface RequestStore {
  claimRequest(input: ClaimInput): Promise<ClaimResult>;
  completeRequest(
    endpoint: ClaimInput["endpoint"],
    keyHash: string,
    requestFingerprint: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void>;
}

export interface ContactStore extends RequestStore {
  insertContact(values: Record<string, unknown>): Promise<unknown>;
}

export interface ReservationStore extends RequestStore {
  createReservationRequest(values: Record<string, unknown>): Promise<{
    reference: string;
    status: string;
  }>;
}

type SupabaseResult = { data?: unknown; error?: { message?: string; code?: string } | null };
type SupabaseClient = {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<SupabaseResult>;
  from(name: string): any;
};

function dbError(operation: string, error?: { message?: string } | null): Error {
  return new Error(`${operation}: ${error?.message ?? "resposta de base de dades no vàlida"}`);
}

export function createFormStore(client: SupabaseClient): ContactStore & ReservationStore {
  return {
    async claimRequest(input) {
      const { data, error } = await client.rpc("claim_public_form_request", {
        p_endpoint: input.endpoint,
        p_key_hash: input.keyHash,
        p_request_fingerprint: input.requestFingerprint,
        p_client_hash: input.clientHash,
        p_max_requests: input.maxRequests,
        p_window_seconds: input.windowSeconds,
      });
      if (error || !data || typeof data !== "object") throw dbError("No s'ha pogut registrar la petició", error);
      const result = data as Record<string, unknown>;
      const outcome = result.outcome;
      if (outcome === "replay" || outcome === "rate_limited") {
        return {
          outcome,
          responseStatus: Number(result.response_status),
          responseBody: result.response_body,
        } as ClaimResult;
      }
      if (outcome === "claimed" || outcome === "conflict" || outcome === "processing") {
        return { outcome } as ClaimResult;
      }
      throw dbError("Resultat desconegut en registrar la petició");
    },

    async completeRequest(endpoint, keyHash, requestFingerprint, responseStatus, responseBody) {
      const { data, error } = await client.rpc("complete_public_form_request", {
        p_endpoint: endpoint,
        p_key_hash: keyHash,
        p_request_fingerprint: requestFingerprint,
        p_response_status: responseStatus,
        p_response_body: responseBody,
      });
      if (error || data !== true) throw dbError("No s'ha pogut completar la petició", error);
    },

    async insertContact(values) {
      const { data, error } = await client.from("contacts").insert(values).select("id").single();
      if (error || !data) throw dbError("No s'ha pogut desar el missatge", error);
      return data;
    },

    async createReservationRequest(values) {
      const { data, error } = await client.rpc("create_reservation_request", values);
      if (error || !data || typeof data !== "object") {
        throw dbError("No s'ha pogut crear la sol·licitud de reserva", error);
      }
      const result = data as Record<string, unknown>;
      if (typeof result.reference !== "string" || typeof result.status !== "string") {
        throw dbError("Resposta de reserva no vàlida");
      }
      return { reference: result.reference, status: result.status };
    },
  };
}

// --- Payment (Stripe) support -------------------------------------------
//
// Two distinct clients are involved, deliberately:
//  - the CALLER's own client (built from their Authorization header) is used
//    only to read the reservation. This doubles as the staff-only access
//    check: `reservations_admin_read` RLS only lets staff read it, so a
//    non-staff caller gets nothing back and the handler rejects — no
//    separate role check needed.
//  - the SERVICE-ROLE client does the actual writes, exactly like every
//    other Edge Function in this project (payment_intents has no INSERT
//    policy for authenticated users; only service_role can write it).

export interface PaymentReservationLookup {
  id: string;
  publicReference: string;
  status: string;
  email: string;
  firstName: string;
  locale: string | null;
  totalAmount: number;
  currency: string;
}

export interface PaymentIntentRecord {
  id: string;
  externalReference: string | null;
  status: string;
}

export interface PaymentStore {
  fetchReservationAsCaller(reservationId: string): Promise<PaymentReservationLookup | null>;
  insertOrGetPaymentIntent(input: {
    reservationId: string;
    provider: string;
    amount: number;
    currency: string;
    idempotencyKeyHash: string;
  }): Promise<{ record: PaymentIntentRecord; created: boolean }>;
  setPaymentIntentExternalReference(id: string, externalReference: string): Promise<void>;
  markReservationPaymentPending(reservationId: string): Promise<void>;
}

export function createPaymentStore(callerClient: SupabaseClient, serviceClient: SupabaseClient): PaymentStore {
  return {
    async fetchReservationAsCaller(reservationId) {
      const { data, error } = await callerClient
        .from("reservations")
        .select("id, public_reference, status, email, first_name, locale, total_amount, currency")
        .eq("id", reservationId)
        .maybeSingle();
      if (error) throw dbError("No s'ha pogut consultar la reserva", error);
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: row.id as string,
        publicReference: row.public_reference as string,
        status: row.status as string,
        email: row.email as string,
        firstName: row.first_name as string,
        locale: (row.locale as string | null) ?? null,
        totalAmount: Number(row.total_amount),
        currency: row.currency as string,
      };
    },

    async insertOrGetPaymentIntent(input) {
      const { data, error } = await serviceClient
        .from("payment_intents")
        .insert({
          reservation_id: input.reservationId,
          provider: input.provider,
          status: "created",
          amount: input.amount,
          currency: input.currency,
          idempotency_key_hash: input.idempotencyKeyHash,
        })
        .select("id, external_reference, status")
        .single();

      if (!error && data) {
        const row = data as Record<string, unknown>;
        return {
          created: true,
          record: {
            id: row.id as string,
            externalReference: (row.external_reference as string | null) ?? null,
            status: row.status as string,
          },
        };
      }

      // 23505 = unique_violation: a payment intent for this reservation
      // already exists (idx_payment_idempotency) — fetch it instead of
      // failing, so retries and double-clicks are idempotent.
      if (error?.code === "23505") {
        const existing = await serviceClient
          .from("payment_intents")
          .select("id, external_reference, status")
          .eq("provider", input.provider)
          .eq("idempotency_key_hash", input.idempotencyKeyHash)
          .single();
        if (existing.error || !existing.data) {
          throw dbError("No s'ha pogut recuperar la intenció de pagament existent", existing.error);
        }
        const row = existing.data as Record<string, unknown>;
        return {
          created: false,
          record: {
            id: row.id as string,
            externalReference: (row.external_reference as string | null) ?? null,
            status: row.status as string,
          },
        };
      }

      throw dbError("No s'ha pogut crear la intenció de pagament", error);
    },

    async setPaymentIntentExternalReference(id, externalReference) {
      const { error } = await serviceClient
        .from("payment_intents")
        .update({ external_reference: externalReference, status: "pending" })
        .eq("id", id);
      if (error) throw dbError("No s'ha pogut desar la referència de pagament", error);
    },

    async markReservationPaymentPending(reservationId) {
      const { error } = await serviceClient
        .from("reservations")
        .update({ status: "payment_pending" })
        .eq("id", reservationId);
      if (error) throw dbError("No s'ha pogut marcar la reserva com a pendent de pagament", error);
    },
  };
}

export interface WebhookStore {
  findPaymentIntentByExternalReference(
    provider: string,
    externalReference: string,
  ): Promise<{ id: string; reservationId: string; status: string } | null>;
  markPaymentIntentStatus(id: string, status: string): Promise<void>;
  transitionReservation(reservationId: string, newStatus: string, reason?: string): Promise<void>;
}

export function createWebhookStore(serviceClient: SupabaseClient): WebhookStore {
  return {
    async findPaymentIntentByExternalReference(provider, externalReference) {
      const { data, error } = await serviceClient
        .from("payment_intents")
        .select("id, reservation_id, status")
        .eq("provider", provider)
        .eq("external_reference", externalReference)
        .maybeSingle();
      if (error) throw dbError("No s'ha pogut consultar la intenció de pagament", error);
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return { id: row.id as string, reservationId: row.reservation_id as string, status: row.status as string };
    },

    async markPaymentIntentStatus(id, status) {
      const { error } = await serviceClient.from("payment_intents").update({ status }).eq("id", id);
      if (error) throw dbError("No s'ha pogut actualitzar la intenció de pagament", error);
    },

    async transitionReservation(reservationId, newStatus, reason) {
      const { data, error } = await serviceClient.rpc("transition_reservation", {
        p_reservation_id: reservationId,
        p_new_status: newStatus,
        p_reason: reason ?? null,
      });
      if (error || data !== true) throw dbError("No s'ha pogut canviar l'estat de la reserva", error);
    },
  };
}
