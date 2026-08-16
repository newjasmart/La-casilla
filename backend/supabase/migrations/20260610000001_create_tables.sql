-- La Casilla — foundation for one whole-house rental.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Authorization is attached to auth.users, but no user is seeded.
create table public.staff_members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('admin', 'content_editor', 'technical_admin')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Exactly one rentable property. Commercial settings are deliberately kept
-- separate from content that a content editor may change.
create table public.properties (
  id                       smallint primary key default 1 check (id = 1),
  max_guests               integer not null check (max_guests > 0),
  max_infants              integer not null default 0 check (max_infants >= 0),
  base_nightly_price       numeric(12,2) not null check (base_nightly_price >= 0),
  base_minimum_nights      integer not null default 1 check (base_minimum_nights >= 1),
  currency                 text not null default 'EUR' check (currency = 'EUR'),
  timezone                 text not null default 'Europe/Madrid' check (timezone = 'Europe/Madrid'),
  minimum_advance_days     integer not null default 1 check (minimum_advance_days >= 0),
  booking_horizon_days     integer not null default 730 check (booking_horizon_days between 1 and 1460),
  request_hold_minutes     integer not null default 1440 check (request_hold_minutes between 15 and 10080),
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.property_content (
  property_id    smallint primary key references public.properties(id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 120),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description    text check (description is null or length(description) <= 10000),
  bedrooms       integer not null check (bedrooms > 0),
  bathrooms      numeric(3,1) not null check (bathrooms > 0),
  amenities      text[] not null default '{}',
  check_in_time  time not null default '16:00',
  check_out_time time not null default '11:00',
  published      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.property_media (
  id             uuid primary key default gen_random_uuid(),
  property_id    smallint not null references public.properties(id) on delete cascade,
  storage_path   text not null unique check (length(btrim(storage_path)) between 1 and 1024),
  category       text not null check (category in ('exterior', 'interior', 'amenities', 'surroundings')),
  alt_text       text not null check (length(btrim(alt_text)) between 1 and 300),
  caption        text check (caption is null or length(caption) <= 1000),
  sort_order     integer not null default 0,
  published      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_property_media_public
  on public.property_media(property_id, category, sort_order)
  where published;

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  property_id    smallint not null references public.properties(id) on delete cascade,
  display_name   text not null check (length(btrim(display_name)) between 1 and 120),
  rating         integer not null check (rating between 1 and 5),
  comment        text not null check (length(btrim(comment)) between 1 and 5000),
  source         text check (source is null or length(source) <= 80),
  source_url     text check (source_url is null or length(source_url) <= 2048),
  stay_month     date check (stay_month is null or stay_month = date_trunc('month', stay_month)::date),
  published      boolean not null default false,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint review_publication_consistent check (
    (published and published_at is not null) or (not published and published_at is null)
  )
);

create index idx_reviews_public
  on public.reviews(property_id, published_at desc)
  where published;

create table public.contacts (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null check (length(btrim(name)) between 2 and 120),
  email                       text not null check (length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone                       text check (phone is null or length(phone) <= 40),
  subject                     text check (subject is null or length(subject) <= 200),
  message                     text not null check (length(btrim(message)) between 5 and 5000),
  status                      text not null default 'new' check (status in ('new', 'read', 'archived')),
  locale                      text not null default 'ca' check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  privacy_notice_accepted_at  timestamptz not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_contacts_status_created on public.contacts(status, created_at desc);

create trigger trg_staff_members_updated before update on public.staff_members
  for each row execute function public.set_updated_at();
create trigger trg_properties_updated before update on public.properties
  for each row execute function public.set_updated_at();
create trigger trg_property_content_updated before update on public.property_content
  for each row execute function public.set_updated_at();
create trigger trg_property_media_updated before update on public.property_media
  for each row execute function public.set_updated_at();
create trigger trg_reviews_updated before update on public.reviews
  for each row execute function public.set_updated_at();
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();

-- Fail closed until the explicit grants and policies in migration 00005.
alter table public.staff_members enable row level security;
alter table public.properties enable row level security;
alter table public.property_content enable row level security;
alter table public.property_media enable row level security;
alter table public.reviews enable row level security;
alter table public.contacts enable row level security;
