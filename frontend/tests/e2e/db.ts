/**
 * Thin helper to read back rows directly from the local Supabase REST API
 * with the service_role key, bypassing RLS — used ONLY in e2e tests to
 * *prove* that an action taken through the UI actually landed in the
 * database, not just that the UI displayed a success message.
 *
 * The URL/key below are the fixed local-dev defaults `supabase start`
 * always prints (see `supabase status` in backend/) — not a secret, and
 * not valid against any real deployment. Override via env vars if your
 * local stack uses non-default ports.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export async function queryTable<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error(`DB proof query failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T[];
}

export async function deleteRow(table: string, query: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`DB cleanup delete failed (${response.status}): ${await response.text()}`);
  }
}
