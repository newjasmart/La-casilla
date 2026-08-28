import { getSupabasePublicConfig } from "@/lib/env";
import type { SupabaseApiPath } from "@/types/api";

export class SupabaseRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "SupabaseRequestError";
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  for (const key of ["message", "error", "error_description"] as const) {
    const value = Reflect.get(payload, key);
    if (typeof value === "string" && value.trim()) return value;
  }

  return fallback;
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function supabaseFetch<T>(
  path: SupabaseApiPath,
  init: RequestInit = {},
): Promise<T> {
  const { url, anonKey } = getSupabasePublicConfig();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${anonKey}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${url}${path}`, { ...init, headers });
  const payload = await responsePayload(response);

  if (!response.ok) {
    throw new SupabaseRequestError(
      errorMessage(payload, "El servidor no ha pogut processar la sol·licitud."),
      response.status,
      payload,
    );
  }

  return payload as T;
}
