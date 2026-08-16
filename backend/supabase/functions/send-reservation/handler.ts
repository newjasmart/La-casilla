import type { FunctionConfig } from "../_shared/config.ts";
import type { ReservationStore } from "../_shared/db.ts";
import { claimFormRequest, completeAndRespond, corsHeaders, isAllowedOrigin, jsonResponse } from "../_shared/http.ts";
import type { ResendPayload } from "../_shared/resend.ts";
import { validateIdempotencyKey } from "../_shared/security.ts";
import { emailClientReserva, emailPropietariReserva } from "../_shared/templates.ts";

export interface ReservaInput {
  nom: string;
  cognoms: string;
  email: string;
  telefon?: string;
  data_arribada: string;
  data_sortida: string;
  adults: number;
  infants?: number;
  bebes?: number;
  comentaris?: string;
  locale?: string;
  privacy_notice_accepted: boolean;
  website?: string; // Honeypot: el frontend l'ha de deixar buit.
}

export interface ReservationDependencies {
  config: FunctionConfig;
  store: ReservationStore;
  sendEmail(payload: ResendPayload): Promise<void>;
  logError?(message: string, error: unknown): void;
}

function validar(body: Partial<ReservaInput>): string | null {
  const requerits: (keyof ReservaInput)[] = [
    "nom", "cognoms", "email", "data_arribada", "data_sortida", "adults",
  ];
  for (const key of requerits) if (body[key] === undefined || body[key] === "") {
    return `Falta el camp obligatori: ${key}`;
  }
  if (!body.privacy_notice_accepted) return "Cal acceptar l'avís de privacitat";
  if (body.nom!.length > 120 || body.cognoms!.length > 160) return "El nom és massa llarg";
  if (body.email!.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email!)) return "Email no vàlid";
  if (body.telefon && body.telefon.length > 40) return "El telèfon és massa llarg";
  if (body.comentaris && body.comentaris.length > 5000) return "Els comentaris són massa llargs";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.data_arribada!) || !/^\d{4}-\d{2}-\d{2}$/.test(body.data_sortida!)) {
    return "Les dates no són vàlides";
  }
  const arrival = new Date(`${body.data_arribada}T00:00:00Z`);
  const departure = new Date(`${body.data_sortida}T00:00:00Z`);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())
      || arrival.toISOString().slice(0, 10) !== body.data_arribada
      || departure.toISOString().slice(0, 10) !== body.data_sortida) {
    return "Les dates no són vàlides";
  }
  if (departure <= arrival) return "La data de sortida ha de ser posterior a la d'arribada";
  if (!Number.isSafeInteger(body.adults) || (body.adults ?? 0) < 1 || body.adults! > 100
      || !Number.isSafeInteger(body.infants ?? 0) || (body.infants ?? 0) < 0
      || !Number.isSafeInteger(body.bebes ?? 0) || (body.bebes ?? 0) < 0) {
    return "Nombre de persones no vàlid";
  }
  if (body.locale && !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(body.locale)) return "Locale no vàlid";
  return null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalize(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    nom: text(body.nom),
    cognoms: text(body.cognoms),
    email: text(body.email)?.toLowerCase(),
    telefon: text(body.telefon) || null,
    data_arribada: text(body.data_arribada),
    data_sortida: text(body.data_sortida),
    adults: typeof body.adults === "number" ? body.adults : undefined,
    infants: typeof body.infants === "number" ? body.infants : 0,
    bebes: typeof body.bebes === "number" ? body.bebes : 0,
    comentaris: text(body.comentaris) || null,
    locale: text(body.locale) || "ca",
    privacy_notice_accepted: body.privacy_notice_accepted === true,
    website: text(body.website) || "",
  };
}

export function createReservationHandler(deps: ReservationDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = isAllowedOrigin(request, deps.config.allowedOrigins);
    if (!origin) return jsonResponse({ error: "Origen no permès" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return jsonResponse({ error: "Mètode no permès" }, 405, origin);

    const idempotencyKey = validateIdempotencyKey(request);
    if (!idempotencyKey) {
      return jsonResponse({ error: "Cal una capçalera Idempotency-Key vàlida (8-200 caràcters)" }, 400, origin);
    }

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return jsonResponse({ error: "Cos JSON no vàlid" }, 400, origin);
    }
    const body = normalize(input);
    const errorValidacio = validar(body as ReservaInput);
    if (errorValidacio && !body.website) return jsonResponse({ error: errorValidacio }, 400, origin);

    let claim;
    try {
      claim = await claimFormRequest(request, "reservation", idempotencyKey, body, deps.config, deps.store);
    } catch (error) {
      deps.logError?.("Error aplicant proteccions de la petició", error);
      return jsonResponse({ error: "No s'ha pogut processar la petició" }, 500, origin);
    }
    if (claim.response) return claim.response;

    const finish = (responseBody: unknown, status = 200) =>
      completeAndRespond(deps.store, "reservation", claim.keyHash, claim.fingerprint, responseBody, status, origin);

    if (body.website) return finish({ ok: true });

    let reservation: { reference: string; status: string };
    try {
      reservation = await deps.store.createReservationRequest({
        p_first_name: body.nom,
        p_last_name: body.cognoms,
        p_email: body.email,
        p_phone: body.telefon,
        p_arrival: body.data_arribada,
        p_departure: body.data_sortida,
        p_adults: body.adults,
        p_children: body.infants,
        p_infants: body.bebes,
        p_guest_message: body.comentaris,
        p_locale: body.locale,
        p_privacy_notice_accepted_at: new Date().toISOString(),
        p_source: "website",
        p_external_reference: null,
      });
    } catch (error) {
      deps.logError?.("Error creant la sol·licitud de reserva", error);
      const unavailable = error instanceof Error && /STAY_NOT_AVAILABLE|23P01/.test(error.message);
      return finish({ error: unavailable ? "La casa no està disponible en aquestes dates" : "No s'ha pogut crear la sol·licitud" }, unavailable ? 409 : 500);
    }

    const data = {
      nom: body.nom!, cognoms: body.cognoms!, email: body.email!, telefon: body.telefon,
      data_arribada: body.data_arribada!, data_sortida: body.data_sortida!,
      adults: body.adults!, infants: body.infants, bebes: body.bebes,
      reference: reservation.reference, comentaris: body.comentaris,
    };

    try {
      const client = emailClientReserva(data, deps.config.casa);
      const owner = emailPropietariReserva(data, deps.config.casa);
      await Promise.all([
        deps.sendEmail({ from: deps.config.casa.from, to: body.email!, subject: client.subject, html: client.html }),
        deps.sendEmail({
          from: deps.config.casa.from, to: deps.config.casa.owner, subject: owner.subject,
          html: owner.html, reply_to: body.email!,
        }),
      ]);
    } catch (error) {
      deps.logError?.("Error enviant els correus de reserva", error);
      return finish({
        ok: true,
        reservation,
        reference: reservation.reference,
        status: reservation.status,
        warning: "Sol·licitud creada però l'enviament del correu ha fallat",
      });
    }

    return finish({ ok: true, reference: reservation.reference, status: reservation.status });
  };
}
