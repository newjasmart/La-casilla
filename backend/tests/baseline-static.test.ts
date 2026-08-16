import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);

async function baseline(): Promise<string> {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(files.length, 6);
  assert.deepEqual(files.map((name) => name.match(/(\d{14})/)?.[1]), [
    "20260610000001", "20260610000002", "20260610000003",
    "20260610000004", "20260610000005", "20260610000006",
  ]);
  return Promise.all(files.map(async (name) => readFile(new URL(name, migrationsDir), "utf8")))
    .then((parts) => parts.join("\n"));
}

test("baseline models one whole property and removes obsolete domains", async () => {
  const sql = await baseline();
  assert.match(sql, /create table public\.properties/);
  assert.match(sql, /check \(id = 1\)/);
  assert.doesNotMatch(sql, /create table public\.(rooms|menu_items|hikes|bike_routes)\b/i);
  assert.doesNotMatch(sql, /\broom_id\b|habitacions_disponibles|habitacio_disponible/i);
});

test("calendar and reservation invariants are enforced by PostgreSQL", async () => {
  const sql = await baseline();
  assert.match(sql, /create table public\.calendar_entries/);
  assert.match(sql, /exclude using gist[\s\S]*stay_period with &&/);
  assert.match(sql, /create_reservation_request/);
  assert.match(sql, /IMMUTABLE_RESERVATION_FIELDS/);
  assert.match(sql, /MINIMUM_NIGHTS_NOT_MET/);
  assert.match(sql, /CAPACITY_EXCEEDED/);
});

test("baseline includes future interfaces without implementing providers", async () => {
  const sql = await baseline();
  assert.match(sql, /create table public\.payment_intents/);
  assert.match(sql, /create table public\.channel_sync_state/);
  const executableSql = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
  assert.doesNotMatch(executableSql, /stripe|booking\.com|api\.booking/i);
  assert.match(sql, /enabled\s+boolean not null default false/);
});

test("RLS fails closed for PII and grants only narrow public RPCs", async () => {
  const sql = await baseline();
  for (const table of ["contacts", "reservations", "calendar_entries", "payment_intents"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /has_staff_role\(array\['admin','technical_admin'\]\)/);
  assert.match(sql, /grant execute on function public\.calculate_stay_quote[\s\S]*to anon, authenticated/);
  assert.match(sql, /create_reservation_request[\s\S]*to service_role/);
});

test("DEV seed is fictitious and contains no transactional or PII rows", async () => {
  const seed = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
  assert.match(seed, /DEV-only fictitious seed/);
  assert.match(seed, /La Casilla DEV/);
  assert.doesNotMatch(seed, /insert into public\.(contacts|reservations|calendar_entries|payment_intents|staff_members)/i);
  assert.doesNotMatch(seed, /@|\+34|marcbarriscosta/i);
});
