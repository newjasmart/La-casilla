import type { SupabasePublicConfig } from "@/types/api";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable d’entorn ${name}.`);
  return value;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const rawUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const url = new URL(rawUrl);

  if (!( ["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ha d’utilitzar HTTP o HTTPS.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ha de ser un origen de Supabase sense cap ruta.");
  }

  return { url: url.origin, anonKey };
}
