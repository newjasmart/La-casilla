-- La Casilla — fix: service_role lacked SELECT/INSERT/UPDATE/DELETE on public
-- tables. Only TRUNCATE/REFERENCES/TRIGGER were present, inherited implicitly;
-- the DML privileges never were. This silently broke every Edge Function that
-- writes as service_role (send-contact, send-reservation) with "permission
-- denied", discovered while testing locally.
--
-- service_role already has BYPASSRLS (see pg_roles), so this grant does not
-- change what data it can see or change — RLS policies never applied to it in
-- the first place. It only makes explicit what the rest of this schema always
-- assumed, and removes the dependency on implicit default-privilege
-- inheritance, which clearly did not behave as expected in at least one
-- environment.

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Keep the same behaviour for any table/sequence added by future migrations.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
