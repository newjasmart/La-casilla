-- La Casilla — authoritative quote, availability and atomic reservation logic.

create or replace function public.calculate_stay_quote(
  p_arrival date,
  p_departure date,
  p_adults integer,
  p_children integer default 0,
  p_infants integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_property public.properties%rowtype;
  v_nights integer;
  v_minimum integer;
  v_nightly numeric(12,2);
  v_fees numeric(12,2);
  v_total numeric(12,2);
  v_lines jsonb;
  v_fee_lines jsonb;
begin
  select * into v_property from public.properties where id = 1;
  if not found or not v_property.active then
    raise exception using errcode = 'P0001', message = 'PROPERTY_UNAVAILABLE';
  end if;
  if p_arrival is null or p_departure is null or p_departure <= p_arrival then
    raise exception using errcode = '22007', message = 'INVALID_STAY_DATES';
  end if;
  if p_adults is null or p_adults < 1 or coalesce(p_children, 0) < 0 or coalesce(p_infants, 0) < 0 then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_COUNTS';
  end if;
  if p_adults + coalesce(p_children, 0) > v_property.max_guests
     or coalesce(p_infants, 0) > v_property.max_infants then
    raise exception using errcode = '22023', message = 'CAPACITY_EXCEEDED';
  end if;
  if p_arrival < current_date + v_property.minimum_advance_days
     or p_arrival > current_date + v_property.booking_horizon_days then
    raise exception using errcode = '22023', message = 'STAY_OUTSIDE_BOOKING_WINDOW';
  end if;

  v_nights := p_departure - p_arrival;
  select greatest(v_property.base_minimum_nights, coalesce(max(rp.minimum_nights), 0))
    into v_minimum
  from generate_series(p_arrival, p_departure - 1, interval '1 day') as gs(day)
  left join lateral (
    select minimum_nights
    from public.rate_periods
    where property_id = 1 and active and gs.day::date <@ stay_period
    order by priority desc
    limit 1
  ) rp on true;
  if v_nights < v_minimum then
    raise exception using errcode = '22023', message = 'MINIMUM_NIGHTS_NOT_MET';
  end if;

  with nightly as (
    select day::date as stay_date,
      coalesce(rp.nightly_price, v_property.base_nightly_price)::numeric(12,2) as amount,
      rp.rate_name
    from generate_series(p_arrival, p_departure - 1, interval '1 day') as gs(day)
    left join lateral (
      select nightly_price, name as rate_name
      from public.rate_periods
      where property_id = 1 and active and gs.day::date <@ stay_period
      order by priority desc
      limit 1
    ) rp on true
  )
  select coalesce(sum(amount), 0)::numeric(12,2),
         coalesce(jsonb_agg(jsonb_build_object(
           'date', stay_date, 'amount', amount,
           'rate', coalesce(rate_name, 'base')
         ) order by stay_date), '[]'::jsonb)
    into v_nightly, v_lines
  from nightly;

  with applicable_fees as (
    select calculation, amount,
      case
        when valid_period is null then v_nights
        else upper(valid_period * daterange(p_arrival, p_departure, '[)'))
             - lower(valid_period * daterange(p_arrival, p_departure, '[)'))
      end as applicable_nights
    from public.fee_rules
    where property_id = 1 and active
      and (valid_period is null or valid_period && daterange(p_arrival, p_departure, '[)'))
  )
  select coalesce(sum(
           case calculation when 'per_stay' then amount else amount * applicable_nights end
         ), 0)::numeric(12,2),
         coalesce(jsonb_agg(jsonb_build_object(
           'calculation', calculation,
           'unit_amount', amount,
           'units', case calculation when 'per_stay' then 1 else applicable_nights end,
           'total', case calculation when 'per_stay' then amount else amount * applicable_nights end
         )), '[]'::jsonb)
    into v_fees, v_fee_lines
  from applicable_fees;

  v_total := v_nightly + v_fees;
  return jsonb_build_object(
    'available', not exists (
      select 1 from public.calendar_entries
      where property_id = 1 and state = 'active'
        and stay_period && daterange(p_arrival, p_departure, '[)')
    ),
    'arrival_date', p_arrival,
    'departure_date', p_departure,
    'nights', v_nights,
    'minimum_nights', v_minimum,
    'currency', v_property.currency,
    'nightly_subtotal', v_nightly,
    'fees_total', v_fees,
    'discount_total', 0.00,
    'total_amount', v_total,
    'nightly_lines', v_lines,
    'fee_lines', v_fee_lines
  );
end;
$$;

create or replace function public.is_stay_available(
  p_arrival date,
  p_departure date,
  p_adults integer,
  p_children integer default 0,
  p_infants integer default 0
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote jsonb;
begin
  v_quote := public.calculate_stay_quote(p_arrival, p_departure, p_adults, p_children, p_infants);
  return (v_quote ->> 'available')::boolean;
exception
  when sqlstate '22007' or sqlstate '22023' or sqlstate 'P0001' then return false;
end;
$$;

create or replace function public.create_reservation_request(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_arrival date,
  p_departure date,
  p_adults integer,
  p_children integer,
  p_infants integer,
  p_guest_message text,
  p_locale text,
  p_privacy_notice_accepted_at timestamptz,
  p_source text default 'website',
  p_external_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_property public.properties%rowtype;
  v_quote jsonb;
  v_entry_id uuid;
  v_reservation_id uuid;
  v_public_reference text;
begin
  if length(btrim(coalesce(p_first_name, ''))) not between 1 and 120
     or length(btrim(coalesce(p_last_name, ''))) not between 1 and 160
     or length(coalesce(p_email, '')) > 320
     or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or (p_phone is not null and length(p_phone) > 40)
     or (p_guest_message is not null and length(p_guest_message) > 5000)
     or p_locale !~ '^[a-z]{2}(?:-[A-Z]{2})?$'
     or p_privacy_notice_accepted_at is null
     or p_source !~ '^[a-z][a-z0-9_-]{1,49}$' then
    raise exception using errcode = '22023', message = 'INVALID_RESERVATION_INPUT';
  end if;

  select * into v_property from public.properties where id = 1 for share;
  v_quote := public.calculate_stay_quote(
    p_arrival, p_departure, p_adults, coalesce(p_children, 0), coalesce(p_infants, 0)
  );
  if not (v_quote ->> 'available')::boolean then
    raise exception using errcode = '23P01', message = 'STAY_NOT_AVAILABLE';
  end if;

  begin
    insert into public.calendar_entries(
      property_id, stay_period, kind, state, source, external_reference, expires_at
    ) values (
      1, daterange(p_arrival, p_departure, '[)'), 'reservation', 'active', p_source,
      p_external_reference, now() + make_interval(mins => v_property.request_hold_minutes)
    ) returning id into v_entry_id;
  exception when exclusion_violation then
    raise exception using errcode = '23P01', message = 'STAY_NOT_AVAILABLE';
  end;

  insert into public.reservations(
    property_id, calendar_entry_id, status, source, external_reference,
    first_name, last_name, email, phone, arrival_date, departure_date,
    adults, children, infants, nights, nightly_subtotal, fees_total,
    discount_total, total_amount, currency, pricing_snapshot, guest_message,
    locale, privacy_notice_accepted_at
  ) values (
    1, v_entry_id, 'requested', p_source, p_external_reference,
    btrim(p_first_name), btrim(p_last_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''),
    p_arrival, p_departure, p_adults, coalesce(p_children, 0), coalesce(p_infants, 0),
    (v_quote ->> 'nights')::integer, (v_quote ->> 'nightly_subtotal')::numeric,
    (v_quote ->> 'fees_total')::numeric, (v_quote ->> 'discount_total')::numeric,
    (v_quote ->> 'total_amount')::numeric, v_quote ->> 'currency', v_quote,
    nullif(btrim(p_guest_message), ''), p_locale, p_privacy_notice_accepted_at
  ) returning id, public_reference into v_reservation_id, v_public_reference;

  insert into public.reservation_status_history(reservation_id, from_status, to_status, reason)
  values (v_reservation_id, null, 'requested', 'website_request');

  return jsonb_build_object(
    'ok', true,
    'reservation_id', v_reservation_id,
    'reference', v_public_reference,
    'status', 'requested'
  );
end;
$$;

create or replace function public.create_calendar_block(
  p_start date,
  p_end date,
  p_kind text,
  p_note text default null,
  p_source text default 'manual',
  p_external_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_end <= p_start or p_kind not in ('manual', 'maintenance', 'external') then
    raise exception using errcode = '22023', message = 'INVALID_CALENDAR_BLOCK';
  end if;
  insert into public.calendar_entries(
    property_id, stay_period, kind, source, external_reference, private_note
  ) values (1, daterange(p_start, p_end, '[)'), p_kind, p_source, p_external_reference, p_note)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'CALENDAR_CONFLICT';
end;
$$;

create or replace function public.guard_reservation_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.public_reference <> old.public_reference
     or new.property_id <> old.property_id or new.calendar_entry_id <> old.calendar_entry_id
     or new.arrival_date <> old.arrival_date or new.departure_date <> old.departure_date
     or new.adults <> old.adults or new.children <> old.children or new.infants <> old.infants
     or new.nights <> old.nights or new.nightly_subtotal <> old.nightly_subtotal
     or new.fees_total <> old.fees_total or new.discount_total <> old.discount_total
     or new.total_amount <> old.total_amount or new.currency <> old.currency
     or new.pricing_snapshot <> old.pricing_snapshot or new.source <> old.source
     or new.external_reference is distinct from old.external_reference
     or new.privacy_notice_accepted_at <> old.privacy_notice_accepted_at
     or new.requested_at <> old.requested_at or new.created_at <> old.created_at then
    raise exception using errcode = '22023', message = 'IMMUTABLE_RESERVATION_FIELDS';
  end if;
  if new.status <> old.status then
    if not (
      (old.status = 'requested' and new.status in ('payment_pending', 'confirmed', 'cancelled', 'expired'))
      or (old.status = 'payment_pending' and new.status in ('confirmed', 'cancelled', 'expired'))
      or (old.status = 'confirmed' and new.status = 'cancelled')
    ) then raise exception using errcode = '22023', message = 'INVALID_STATUS_TRANSITION'; end if;
    if new.status = 'cancelled' and length(btrim(coalesce(new.cancellation_reason, ''))) < 3 then
      raise exception using errcode = '22023', message = 'CANCELLATION_REASON_REQUIRED';
    end if;
    new.confirmed_at := case
      when new.status = 'confirmed' then coalesce(old.confirmed_at, now())
      else old.confirmed_at
    end;
    new.cancelled_at := case when new.status = 'cancelled' then now() else null end;
    new.expired_at := case when new.status = 'expired' then now() else null end;
  elsif new.confirmed_at is distinct from old.confirmed_at
     or new.cancelled_at is distinct from old.cancelled_at
     or new.expired_at is distinct from old.expired_at
     or new.cancellation_reason is distinct from old.cancellation_reason then
    raise exception using errcode = '22023', message = 'STATUS_FIELDS_REQUIRE_TRANSITION';
  end if;
  return new;
end;
$$;

create or replace function public.sync_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status in ('cancelled', 'expired') then
    update public.calendar_entries set
      state = case when new.status = 'expired' then 'expired' else 'released' end,
      released_at = now(), expires_at = null
    where id = new.calendar_entry_id;
  elsif new.status = 'confirmed' then
    update public.calendar_entries set expires_at = null where id = new.calendar_entry_id;
  end if;
  insert into public.reservation_status_history(
    reservation_id, from_status, to_status, reason, changed_by
  ) values (
    new.id, old.status, new.status, new.cancellation_reason, auth.uid()
  );
  return new;
end;
$$;

create trigger trg_reservations_guard before update on public.reservations
  for each row execute function public.guard_reservation_update();
create trigger trg_reservations_status_sync after update of status on public.reservations
  for each row execute function public.sync_reservation_status();

create or replace function public.transition_reservation(
  p_reservation_id uuid,
  p_new_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.reservations
  set status = p_new_status,
      cancellation_reason = case when p_new_status = 'cancelled' then btrim(p_reason) else null end
  where id = p_reservation_id;
  if not found then raise exception using errcode = 'P0002', message = 'RESERVATION_NOT_FOUND'; end if;
  return true;
end;
$$;

revoke all on function public.calculate_stay_quote(date,date,integer,integer,integer) from public;
revoke all on function public.is_stay_available(date,date,integer,integer,integer) from public;
revoke all on function public.create_reservation_request(text,text,text,text,date,date,integer,integer,integer,text,text,timestamptz,text,text) from public;
revoke all on function public.create_calendar_block(date,date,text,text,text,text) from public;
revoke all on function public.transition_reservation(uuid,text,text) from public;
