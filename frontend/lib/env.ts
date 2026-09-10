import type { SupabasePublicConfig } from "@/types/api";

// `process.env.NEXT_PUBLIC_*` must appear as a literal, static expression —
// written out here rather than as `process.env[name]` — because Next.js
// inlines public env vars into client bundles by textually matching that
// exact literal at build time. A dynamic property access reads the real
// environment on the server (so this bug stayed invisible as long as this
// file was only used from Server Components), but resolves to `undefined`
// in every browser bundle, however correct `.env.local` is.
function requiredValue(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Falta la variable d’entorn ${name}.`);
  return trimmed;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const rawUrl = requiredValue("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = requiredValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const url = new URL(rawUrl);

  if (!( ["http:", "https:"] as const).includes(url.protocol as "http:" | "https:")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ha d’utilitzar HTTP o HTTPS.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ha de ser un origen de Supabase sense cap ruta.");
  }

  return { url: url.origin, anonKey };
}
