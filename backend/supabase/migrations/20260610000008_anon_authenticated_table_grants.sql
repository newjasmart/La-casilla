-- La Casilla — fix: same root cause as 20260610000007, for `anon` and
-- `authenticated`. Both only had TRUNCATE/REFERENCES/TRIGGER on every public
-- table (never SELECT/INSERT/UPDATE/DELETE), so every RLS policy in
-- 20260610000005 was unreachable: Postgres denies access at the base
-- privilege check before a row-level policy is ever evaluated. Discovered
-- locally as "permission denied for table properties" on the public homepage
-- (anon) — the same missing grant would also block every /admin page
-- (authenticated) the moment a staff member signs in.
--
-- `anon` gets exactly the tables its own read policies already scope to
-- published/active rows — nothing broader, matching the fail-closed intent
-- stated in 20260610000001.
grant select on
  public.properties,
  public.property_content,
  public.property_media,
  public.reviews
to anon;

-- `authenticated` already has its access shaped per table by the
-- has_staff_role() policies in 20260610000005 (select-only on some tables,
-- full CRUD on others, none at all where no policy exists for that
-- operation). Granting the base privilege broadly is safe: RLS still denies
-- any operation without a matching permissive policy.
grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
