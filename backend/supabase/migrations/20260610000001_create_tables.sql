-- =========================================================================
-- La Casilla - Esquema principal
-- =========================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Funció utilitària: actualitza updated_at automàticament
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- 1. HABITACIONS  (rooms)
-- =========================================================================
create table public.rooms (
  id                uuid primary key default uuid_generate_v4(),
  nom               text not null,
  descripcio        text,
  preu              numeric(10,2) not null check (preu >= 0),
  capacitat         int not null check (capacitat > 0),
  superficie        int,
  serveis           text[] default '{}',
  imatge_principal  text,
  imatges           text[] default '{}',
  actiu             boolean not null default true,
  ordre             int default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_rooms_updated
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. RESERVES  (reservations)
-- =========================================================================
create type public.estat_reserva as enum ('pendent', 'confirmada', 'cancellada');

create table public.reservations (
  id                uuid primary key default uuid_generate_v4(),
  room_id           uuid not null references public.rooms(id) on delete restrict,
  nom               text not null,
  cognoms           text not null,
  email             text not null,
  telefon           text,
  data_arribada     date not null,
  data_sortida      date not null,
  nombre_persones   int  not null check (nombre_persones > 0),
  preu_total        numeric(10,2),
  comentaris        text,
  estat             public.estat_reserva not null default 'pendent',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint dates_valides check (data_sortida > data_arribada)
);

create index idx_reservations_room    on public.reservations(room_id);
create index idx_reservations_dates   on public.reservations(data_arribada, data_sortida);
create index idx_reservations_estat   on public.reservations(estat);

create trigger trg_reservations_updated
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 3. FOTOS  (photos / galeria)
-- =========================================================================
create type public.album_foto as enum ('casa', 'habitacions', 'piscina', 'restaurant', 'excursions', 'bici');

create table public.photos (
  id            uuid primary key default uuid_generate_v4(),
  album         public.album_foto not null,
  titol         text,
  descripcio    text,
  url           text not null,
  ordre         int default 0,
  created_at    timestamptz not null default now()
);

create index idx_photos_album on public.photos(album);

-- =========================================================================
-- 4. MENU  (menu_items)
-- =========================================================================
create type public.categoria_menu as enum ('entrants', 'plats', 'postres', 'begudes');

create table public.menu_items (
  id            uuid primary key default uuid_generate_v4(),
  categoria     public.categoria_menu not null,
  nom           text not null,
  descripcio    text,
  preu          numeric(10,2) not null check (preu >= 0),
  alergens      text[] default '{}',
  disponible    boolean not null default true,
  ordre         int default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_menu_categoria on public.menu_items(categoria);

create trigger trg_menu_updated
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 5. EXCURSIONS  (hikes)
-- =========================================================================
create type public.dificultat as enum ('facil', 'mitjana', 'dificil');

create table public.hikes (
  id            uuid primary key default uuid_generate_v4(),
  nom           text not null,
  descripcio    text,
  distancia     numeric(6,2) not null check (distancia >= 0),
  durada        text,
  dificultat    public.dificultat not null default 'facil',
  desnivell     int default 0,
  punt_inici    text,
  gpx_url       text,
  imatge        text,
  coordenades   jsonb,
  created_at    timestamptz not null default now()
);

-- =========================================================================
-- 6. RUTES DE BICI  (bike_routes)
-- =========================================================================
create type public.tipus_bici as enum ('carretera', 'btt', 'gravel');

create table public.bike_routes (
  id            uuid primary key default uuid_generate_v4(),
  nom           text not null,
  descripcio    text,
  distancia     numeric(6,2) not null check (distancia >= 0),
  desnivell     int default 0,
  dificultat    public.dificultat not null default 'mitjana',
  durada        text,
  tipus         public.tipus_bici not null default 'btt',
  gpx_url       text,
  imatge        text,
  coordenades   jsonb,
  created_at    timestamptz not null default now()
);

-- =========================================================================
-- 7. RESSENYES  (reviews)
-- =========================================================================
create table public.reviews (
  id            uuid primary key default uuid_generate_v4(),
  nom           text not null,
  email         text,
  nota          int  not null check (nota between 1 and 5),
  comentari     text not null,
  aprovada      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index idx_reviews_aprovada on public.reviews(aprovada);

-- =========================================================================
-- 8. CONTACTES  (contacts)
-- =========================================================================
create table public.contacts (
  id            uuid primary key default uuid_generate_v4(),
  nom           text not null,
  email         text not null,
  telefon       text,
  assumpte      text,
  missatge      text not null,
  llegit        boolean not null default false,
  created_at    timestamptz not null default now()
);

create index idx_contacts_llegit on public.contacts(llegit);
