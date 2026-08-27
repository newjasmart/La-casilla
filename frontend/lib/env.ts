import type { SupabasePublicConfig } from "@/types/api";

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`La variable d'environnement ${name} est manquante.`);
  }

  return normalized;
}

function normalizeSupabaseUrl(value: string): string {
  const url = new URL(value);

  if (!(["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL doit utiliser HTTP ou HTTPS.");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL doit être une origine Supabase sans chemin.");
  }

  return url.origin;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const anonKey = required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return {
    url: normalizeSupabaseUrl(url),
    anonKey,
  };
}
