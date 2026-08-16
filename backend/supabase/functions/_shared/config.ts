export interface EnvReader {
  get(name: string): string | undefined;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface CasaConfig {
  nom: string;
  telefon: string;
  adreca: string;
  web: string;
  from: string;
  owner: string;
}

export interface FunctionConfig {
  casa: CasaConfig;
  allowedOrigins: string[];
  hashSecret: string;
  rateLimitMax: number;
  rateLimitWindowSeconds: number;
  emailDeliveryMode: "mock" | "live";
}

const RESEND_FROM_EMAIL = "La Casilla <reserves@lacasillacasarural.com>";

export function runtimeEnv(): EnvReader {
  const deno = (globalThis as { Deno?: { env?: EnvReader } }).Deno;
  if (!deno?.env) throw new ConfigError("Deno.env no està disponible");
  return deno.env;
}

function required(env: EnvReader, name: string): string {
  const value = env.get(name)?.trim();
  if (!value) throw new ConfigError(`Falta la variable d'entorn ${name}`);
  return value;
}

function parsePositiveInteger(env: EnvReader, name: string, fallback: number): number {
  const raw = env.get(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConfigError(`${name} ha de ser un enter positiu`);
  }
  return value;
}

export function extractEmailAddress(value: string): string | null {
  const match = value.trim().match(/^(?:[^<>\r\n]+<\s*)?([^\s<>@]+@[^\s<>@]+)\s*>?$/);
  if (!match) return null;
  const email = match[1].toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function assertApprovedFromAddress(value: string): void {
  if (value.trim() !== RESEND_FROM_EMAIL) {
    throw new ConfigError(`RESEND_FROM_EMAIL ha de ser exactament ${RESEND_FROM_EMAIL}`);
  }
}

export function emailDeliveryMode(env: EnvReader): "mock" | "live" {
  const mode = env.get("EMAIL_DELIVERY_MODE")?.trim() || "live";
  if (mode !== "mock" && mode !== "live") {
    throw new ConfigError("EMAIL_DELIVERY_MODE ha de ser mock o live");
  }
  return mode;
}

export function requireResendApiKey(env: EnvReader): string {
  return required(env, "RESEND_API_KEY");
}

export function parseAllowedOrigins(value: string): string[] {
  const origins = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (origins.length === 0) throw new ConfigError("ALLOWED_ORIGINS no pot estar buit");

  return [...new Set(origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigError(`Origen no vàlid a ALLOWED_ORIGINS: ${origin}`);
    }
    if (!(["http:", "https:"].includes(url.protocol)) || url.origin !== origin) {
      throw new ConfigError(`ALLOWED_ORIGINS només admet orígens http(s) sense camí: ${origin}`);
    }
    return url.origin;
  }))];
}

export function loadFunctionConfig(env: EnvReader): FunctionConfig {
  const deliveryMode = emailDeliveryMode(env);
  if (deliveryMode === "live") requireResendApiKey(env);
  const from = required(env, "RESEND_FROM_EMAIL");
  assertApprovedFromAddress(from);

  const owner = required(env, "RESEND_OWNER_EMAIL");
  if (!extractEmailAddress(owner)) {
    throw new ConfigError("RESEND_OWNER_EMAIL ha de ser una adreça de correu vàlida");
  }

  const web = required(env, "CASA_WEB");
  let webUrl: URL;
  try {
    webUrl = new URL(web);
  } catch {
    throw new ConfigError("CASA_WEB ha de ser una URL vàlida");
  }
  if (webUrl.origin !== "https://lacasillacasarural.com"
      || webUrl.pathname !== "/" || webUrl.search || webUrl.hash
      || webUrl.username || webUrl.password) {
    throw new ConfigError("CASA_WEB ha de ser exactament https://lacasillacasarural.com");
  }

  const hashSecret = required(env, "ANTI_SPAM_HASH_SECRET");
  if (hashSecret.length < 32) {
    throw new ConfigError("ANTI_SPAM_HASH_SECRET ha de tenir com a mínim 32 caràcters");
  }

  return {
    casa: {
      nom: required(env, "CASA_NOM"),
      telefon: env.get("CASA_TELEFON")?.trim() ?? "",
      adreca: env.get("CASA_ADRECA")?.trim() ?? "",
      web: webUrl.toString().replace(/\/$/, ""),
      from,
      owner,
    },
    allowedOrigins: parseAllowedOrigins(required(env, "ALLOWED_ORIGINS")),
    hashSecret,
    rateLimitMax: parsePositiveInteger(env, "RATE_LIMIT_MAX_REQUESTS", 5),
    rateLimitWindowSeconds: parsePositiveInteger(env, "RATE_LIMIT_WINDOW_SECONDS", 3600),
    emailDeliveryMode: deliveryMode,
  };
}

export function loadDatabaseConfig(env: EnvReader): { url: string; serviceRoleKey: string } {
  return {
    url: required(env, "SUPABASE_URL"),
    serviceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}
