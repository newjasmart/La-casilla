-- Supports the automatic, no-manual-review payment flow: the guest is
-- charged in full immediately after requesting a reservation (no admin
-- gate). Two changes:
--
-- 1. create_reservation_request now also returns total_amount/currency, so
--    the Edge Function that just created the reservation can build a
--    Stripe Checkout Session for the right amount without a second
--    round-trip.
-- 2. extend_payment_hold lets the payment flow refresh the calendar hold
--    (calendar_entries.expires_at) at the moment a reservation moves to
--    payment_pending — fixing a real gap: the hold was only ever set once,
--    at initial request time, so a guest who took a while to complete
--    payment could have their dates auto-released by the nightly cleanup
--    job before finishing checkout.

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
    'status', 'requested',
    'total_amount', v_quote -> 'total_amount',
    'currency', v_quote -> 'currency'
  );
end;
$$;

create or replace function public.extend_payment_hold(
  p_reservation_id uuid,
  p_hold_minutes integer default 1440
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calendar_entry_id uuid;
begin
  if p_hold_minutes not between 15 and 10080 then
    raise exception using errcode = '22023', message = 'INVALID_HOLD_MINUTES';
  end if;

  select calendar_entry_id into v_calendar_entry_id
  from public.reservations where id = p_reservation_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESERVATION_NOT_FOUND';
  end if;

  update public.calendar_entries
  set expires_at = now() + make_interval(mins => p_hold_minutes)
  where id = v_calendar_entry_id and state = 'active';

  return found;
end;
$$;

revoke all on function public.extend_payment_hold(uuid,integer) from public;
grant execute on function public.extend_payment_hold(uuid,integer) to service_role;
