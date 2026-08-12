-- =========================================================================
-- Disponibilitat: funció per cercar habitacions lliures entre dues dates
-- =========================================================================

create or replace function public.habitacions_disponibles(
  p_data_arribada  date,
  p_data_sortida   date,
  p_persones       int default 1
)
returns setof public.rooms
language sql
stable
as $$
  select r.*
  from public.rooms r
  where r.actiu = true
    and r.capacitat >= p_persones
    and not exists (
      select 1
      from public.reservations res
      where res.room_id = r.id
        and res.estat <> 'cancellada'
        and res.data_arribada < p_data_sortida
        and res.data_sortida  > p_data_arribada
    )
  order by r.ordre, r.preu;
$$;

-- Comprovació puntual: una habitació concreta està lliure?
create or replace function public.habitacio_disponible(
  p_room_id        uuid,
  p_data_arribada  date,
  p_data_sortida   date
)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from public.reservations
    where room_id = p_room_id
      and estat <> 'cancellada'
      and data_arribada < p_data_sortida
      and data_sortida  > p_data_arribada
  );
$$;
