-- =========================================================================
-- Row Level Security
-- Principi:
--   - El públic (anon) llegeix el contingut que ha de mostrar la web.
--   - El públic NO pot inserir directament a reservations / contacts / reviews:
--     això es fa a través de les Edge Functions (que validen i envien correu).
--   - El propietari (rol authenticated) té control total a través del panell.
-- =========================================================================

alter table public.rooms         enable row level security;
alter table public.reservations  enable row level security;
alter table public.photos        enable row level security;
alter table public.menu_items    enable row level security;
alter table public.hikes         enable row level security;
alter table public.bike_routes   enable row level security;
alter table public.reviews       enable row level security;
alter table public.contacts      enable row level security;

-- -------------------------------------------------------------------------
-- HABITACIONS
-- -------------------------------------------------------------------------
create policy "Habitacions actives visibles per a tothom"
on public.rooms for select
to anon, authenticated
using (actiu = true);

create policy "Propietari gestiona habitacions"
on public.rooms for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- RESERVES  (només lectura/gestió pel propietari; inserció via Edge Function)
-- -------------------------------------------------------------------------
create policy "Propietari veu reserves"
on public.reservations for select
to authenticated
using (true);

create policy "Propietari gestiona reserves"
on public.reservations for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- FOTOS
-- -------------------------------------------------------------------------
create policy "Fotos visibles per a tothom"
on public.photos for select
to anon, authenticated
using (true);

create policy "Propietari gestiona fotos"
on public.photos for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- MENU
-- -------------------------------------------------------------------------
create policy "Plats disponibles visibles per a tothom"
on public.menu_items for select
to anon, authenticated
using (disponible = true);

create policy "Propietari gestiona menu"
on public.menu_items for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- EXCURSIONS
-- -------------------------------------------------------------------------
create policy "Excursions visibles per a tothom"
on public.hikes for select
to anon, authenticated
using (true);

create policy "Propietari gestiona excursions"
on public.hikes for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- RUTES BICI
-- -------------------------------------------------------------------------
create policy "Rutes visibles per a tothom"
on public.bike_routes for select
to anon, authenticated
using (true);

create policy "Propietari gestiona rutes"
on public.bike_routes for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- RESSENYES  (només es mostren les aprovades)
-- -------------------------------------------------------------------------
create policy "Ressenyes aprovades visibles"
on public.reviews for select
to anon, authenticated
using (aprovada = true);

create policy "Qualsevol pot deixar una ressenya"
on public.reviews for insert
to anon, authenticated
with check (aprovada = false);

create policy "Propietari gestiona ressenyes"
on public.reviews for all
to authenticated
using (true) with check (true);

-- -------------------------------------------------------------------------
-- CONTACTES  (només propietari els pot llegir; inserció via Edge Function)
-- -------------------------------------------------------------------------
create policy "Propietari llegeix contactes"
on public.contacts for select
to authenticated
using (true);

create policy "Propietari gestiona contactes"
on public.contacts for all
to authenticated
using (true) with check (true);
