-- La Casilla — pricing, one shared calendar, reservations and operational seams.

create extension if not exists btree_gist;

create table public.rate_periods (
  id              uuid primary key default gen_random_uuid(),
  property_id     smallint not null references public.properties(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  stay_period     daterange not null,
  nightly_price   numeric(12,2) not null check (nightly_price >= 0),
  minimum_nights  integer not null check (minimum_nights >= 1),
  priority        integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint rate_period_nonempty check (not isempty(stay_period)),
  constraint rate_period_canonical check (
    lower_inc(stay_period) and not upper_inc(stay_period)
    and lower(stay_period) is not null and upper(stay_period) is not null
  ),
  exclude using gist (
    property_id with =,
    priority with =,
    stay_period with &&
  ) where (active)
);

create table public.fee_rules (
  id              uuid primary key default gen_random_uuid(),
  property_id     smallint not null references public.properties(id) on delete cascade,
  code            text not null check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  label           text not null check (length(btrim(label)) between 1 and 120),
  calculation     text not null check (calculation in ('per_stay', 'per_night')),
  amount          numeric(12,2) not null check (amount >= 0),
  valid_period    daterange,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fee_period_nonempty check (valid_period is null or not isempty(valid_period)),
  constraint fee_period_canonical check (
    valid_period is null or (
      lower_inc(valid_period) and not upper_inc(valid_period)
      and lower(valid_period) is not null and upper(valid_period) is not null
    )
  )
);

create unique index idx_fee_rules_code_period
  on public.fee_rules(property_id, code, coalesce(lower(valid_period), '-infinity'::date));

-- All sources of unavailability share this table. The exclusion constraint is
-- the final concurrency guard for website requests, manual blocks and channels.
create table public.calendar_entries (
  id                  uuid primary key default gen_random_uuid(),
  property_id         smallint not null references public.properties(id) on delete restrict,
  stay_period         daterange not null,
  kind                text not null check (kind in ('reservation', 'manual', 'maintenance', 'external')),
  state               text not null default 'active' check (state in ('active', 'released', 'expired')),
  source              text not null default 'website' check (source ~ '^[a-z][a-z0-9_-]{1,49}$'),
  external_reference  text,
  private_note        text check (private_note is null or length(private_note) <= 2000),
  expires_at          timestamptz,
  released_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint calendar_period_nonempty check (not isempty(stay_period)),
  constraint calendar_period_canonical check (
    lower_inc(stay_period) and not upper_inc(stay_period)
    and lower(stay_period) is not null and upper(stay_period) is not null
  ),
  constraint calendar_state_timestamps check (
    (state = 'active' and released_at is null)
    or (state in ('released', 'expired') and released_at is not null)
  ),
  constraint non_reservation_has_no_expiry check (kind = 'reservation' or expires_at is null),
  exclude using gist (
    property_id with =,
    stay_period with &&
  ) where (state = 'active')
);

create unique index idx_calendar_external_reference
  on public.calendar_entries(source, external_reference)
  where external_reference is not null;
create index idx_calendar_expiry on public.calendar_entries(expires_at)
  where state = 'active' and kind = 'reservation' and expires_at is not null;

create table public.reservations (
  id                          uuid primary key default gen_random_uuid(),
  public_reference            text not null unique default ('LC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
                                check (public_reference ~ '^LC-[A-F0-9]{12}$'),
  property_id                 smallint not null references public.properties(id) on delete restrict,
  calendar_entry_id           uuid not null unique references public.calendar_entries(id) on delete restrict,
  status                      text not null default 'requested'
                                check (status in ('requested', 'payment_pending', 'confirmed', 'cancelled', 'expired')),
  source                      text not null default 'website' check (source ~ '^[a-z][a-z0-9_-]{1,49}$'),
  external_reference          text,
  first_name                  text not null check (length(btrim(first_name)) between 1 and 120),
  last_name                   text not null check (length(btrim(last_name)) between 1 and 160),
  email                       text not null check (length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone                       text check (phone is null or length(phone) <= 40),
  arrival_date                date not null,
  departure_date              date not null,
  adults                      integer not null check (adults >= 1),
  children                    integer not null default 0 check (children >= 0),
  infants                     integer not null default 0 check (infants >= 0),
  nights                      integer not null check (nights > 0),
  nightly_subtotal            numeric(12,2) not null check (nightly_subtotal >= 0),
  fees_total                  numeric(12,2) not null default 0 check (fees_total >= 0),
  discount_total              numeric(12,2) not null default 0 check (discount_total >= 0),
  total_amount                numeric(12,2) not null check (total_amount >= 0),
  currency                    text not null default 'EUR' check (currency = 'EUR'),
  pricing_snapshot            jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  guest_message               text check (guest_message is null or length(guest_message) <= 5000),
  locale                      text not null default 'ca' check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  privacy_notice_accepted_at  timestamptz not null,
  requested_at                timestamptz not null default now(),
  confirmed_at                timestamptz,
  cancelled_at                timestamptz,
  expired_at                  timestamptz,
  cancellation_reason         text check (cancellation_reason is null or length(cancellation_reason) <= 1000),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint reservation_dates_valid check (
    departure_date > arrival_date and nights = departure_date - arrival_date
  ),
  constraint reservation_total_consistent check (
    total_amount = nightly_subtotal + fees_total - discount_total
    and discount_total <= nightly_subtotal + fees_total
  ),
  constraint reservation_terminal_timestamps check (
    (status <> 'confirmed' or confirmed_at is not null)
    and ((status = 'cancelled') = (cancelled_at is not null))
    and ((status = 'expired') = (expired_at is not null))
  )
);

create unique index idx_reservations_external_reference
  on public.reservations(source, external_reference)
  where external_reference is not null;
create index idx_reservations_status_arrival on public.reservations(status, arrival_date);
create index idx_reservations_created on public.reservations(created_at desc);

create table public.reservation_status_history (
  id              bigint generated always as identity primary key,
  reservation_id  uuid not null references public.reservations(id) on delete restrict,
  from_status     text,
  to_status       text not null check (to_status in ('requested', 'payment_pending', 'confirmed', 'cancelled', 'expired')),
  reason          text check (reason is null or length(reason) <= 1000),
  changed_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_reservation_history on public.reservation_status_history(reservation_id, created_at);

-- Generic interfaces only: no payment provider or Booking.com integration.
create table public.payment_intents (
  id                    uuid primary key default gen_random_uuid(),
  reservation_id        uuid not null references public.reservations(id) on delete restrict,
  provider              text not null check (provider ~ '^[a-z][a-z0-9_-]{1,49}$'),
  external_reference    text,
  status                text not null check (status in ('created', 'pending', 'paid', 'failed', 'cancelled', 'refunded')),
  amount                numeric(12,2) not null check (amount >= 0),
  currency              text not null default 'EUR' check (currency = 'EUR'),
  idempotency_key_hash  text not null check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index idx_payment_external_ref on public.payment_intents(provider, external_reference)
  where external_reference is not null;
create unique index idx_payment_idempotency on public.payment_intents(provider, idempotency_key_hash);

create table public.channel_sync_state (
  property_id               smallint not null references public.properties(id) on delete cascade,
  channel                   text not null check (channel ~ '^[a-z][a-z0-9_-]{1,49}$'),
  enabled                   boolean not null default false,
  external_property_ref     text,
  last_successful_sync_at   timestamptz,
  last_external_version     text,
  last_error_code           text,
  updated_at                timestamptz not null default now(),
  primary key (property_id, channel),
  constraint disabled_channel_has_no_ref check (enabled or external_property_ref is null)
);

create table public.channel_sync_conflicts (
  id                  bigint generated always as identity primary key,
  property_id         smallint not null references public.properties(id) on delete restrict,
  channel             text not null,
  external_reference  text,
  conflict_code       text not null,
  details             jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

create trigger trg_rate_periods_updated before update on public.rate_periods
  for each row execute function public.set_updated_at();
create trigger trg_fee_rules_updated before update on public.fee_rules
  for each row execute function public.set_updated_at();
create trigger trg_calendar_entries_updated before update on public.calendar_entries
  for each row execute function public.set_updated_at();
create trigger trg_reservations_updated before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger trg_payment_intents_updated before update on public.payment_intents
  for each row execute function public.set_updated_at();
create trigger trg_channel_sync_state_updated before update on public.channel_sync_state
  for each row execute function public.set_updated_at();

alter table public.rate_periods enable row level security;
alter table public.fee_rules enable row level security;
alter table public.calendar_entries enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_status_history enable row level security;
alter table public.payment_intents enable row level security;
alter table public.channel_sync_state enable row level security;
alter table public.channel_sync_conflicts enable row level security;
