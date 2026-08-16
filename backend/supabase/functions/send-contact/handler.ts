import type { FunctionConfig } from "../_shared/config.ts";
import type { ContactStore } from "../_shared/db.ts";
import { completeAndRespond, corsHeaders, isAllowedOrigin, jsonResponse, claimFormRequest } from "../_shared/http.ts";
import type { ResendPayload } from "../_shared/resend.ts";
import { validateIdempotencyKey } from "../_shared/security.ts";
import { emailPropietariContacte } from "../_shared/templates.ts";

export interface ContacteInput {
  nom: string;
  email: string;
  telefon?: string;
  assumpte?: string;
  missatge: string;
  locale?: string;
  privacy_notice_accepted: boolean;
  website?: string; // Honeypot: el frontend l'ha de deixar buit.
}

export interface ContactDependencies {
  config: FunctionConfig;
  store: ContactStore;
  sendEmail(payload: ResendPayload): Promise<void>;
  logError?(message: string, error: unknown): void;
}

function validar(body: Partial<ContacteInput>): string | null {
  if (!body.privacy_notice_accepted) return "Cal acceptar l'avís de privacitat";
  if (!body.nom || body.nom.trim().length < 2) return "El nom és obligatori";
  if (body.nom.length > 120) return "El nom és massa llarg";
  if (!body.email || body.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return "Email no vàlid";
  }
  if (body.telefon && body.telefon.length > 40) return "El telèfon és massa llarg";
  if (body.assumpte && body.assumpte.length > 200) return "L'assumpte és massa llarg";
  if (!body.missatge || body.missatge.trim().length < 5) return "El missatge és massa curt";
  if (body.missatge.length > 5000) return "El missatge és massa llarg";
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
    email: text(body.email)?.toLowerCase(),
    telefon: text(body.telefon) || null,
    assumpte: text(body.assumpte) || null,
    missatge: text(body.missatge),
    locale: text(body.locale) || "ca",
    privacy_notice_accepted: body.privacy_notice_accepted === true,
    website: text(body.website) || "",
  };
}

export function createContactHandler(deps: ContactDependencies) {
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
    const errorValidacio = validar(body as ContacteInput);
    if (errorValidacio && !body.website) return jsonResponse({ error: errorValidacio }, 400, origin);

    let claim;
    try {
      claim = await claimFormRequest(request, "contact", idempotencyKey, body, deps.config, deps.store);
    } catch (error) {
      deps.logError?.("Error aplicant proteccions de la petició", error);
      return jsonResponse({ error: "No s'ha pogut processar la petició" }, 500, origin);
    }
    if (claim.response) return claim.response;

    const finish = (responseBody: unknown, status = 200) =>
      completeAndRespond(deps.store, "contact", claim.keyHash, claim.fingerprint, responseBody, status, origin);

    if (body.website) return finish({ ok: true });

    let contacte: unknown;
    try {
      contacte = await deps.store.insertContact({
        name: body.nom,
        email: body.email,
        phone: body.telefon,
        subject: body.assumpte,
        message: body.missatge,
        locale: body.locale,
        privacy_notice_accepted_at: new Date().toISOString(),
      });
    } catch (error) {
      deps.logError?.("Error desant el missatge", error);
      return finish({ error: "No s'ha pogut desar el missatge" }, 500);
    }

    try {
      const { subject, html } = emailPropietariContacte(body as ContacteInput, deps.config.casa);
      await deps.sendEmail({
        from: deps.config.casa.from,
        to: deps.config.casa.owner,
        subject,
        html,
        reply_to: body.email,
      });
    } catch (error) {
      deps.logError?.("Error enviant el correu de contacte", error);
      return finish({
        ok: true,
        warning: "Missatge desat però l'enviament del correu ha fallat",
      });
    }

    return finish({ ok: true });
  };
}
