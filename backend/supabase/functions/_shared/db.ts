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

type SupabaseResult = { data?: unknown; error?: { message?: string } | null };
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
