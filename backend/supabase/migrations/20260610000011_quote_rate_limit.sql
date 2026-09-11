-- Security hardening: calculate_stay_quote is the only pricing/availability
-- RPC actually called by the public site, directly via PostgREST with the
-- anon key — unlike the reservation/contact forms, it had no throttling at
-- all. A per-IP limit was considered and rejected: empirically (tested
-- against this same local stack), the X-Forwarded-For value PostgREST
-- exposes to SQL via request.headers is not trustworthy here — a client can
-- simply send its own value, defeating a naive per-client limit and giving
-- false confidence. Rather than ship something that looks protected but
-- isn't, this adds one coarse, honest safety net instead: a global cap on
-- anonymous quote requests per hour, high enough to never affect real
-- traffic. It does not apply to the internal call this function makes to
-- itself from create_reservation_request (that path runs as service_role,
-- checked via auth.role(), and is already rate-limited at the edge-function
-- layer where Cloudflare's client-IP header is authoritative).

create table public.quote_rate_limit (
  window_start   timestamptz primary key,
  request_count  integer not null check (request_count > 0)
);

alter table public.quote_rate_limit enable row level security;
-- No policies: this is bookkeeping for enforce_quote_rate_limit() only,
-- exactly like public_form_idempotency/public_form_rate_limits — nobody
-- (anon, authenticated, or otherwise) reads or writes it directly.

create or replace function public.enforce_quote_rate_limit()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / 3600) * 3600);
  v_count integer;
  v_max constant integer := 500; -- generous: real guests checking dates never approach this in an hour.
begin
  insert into public.quote_rate_limit(window_start, request_count)
  values (v_window_start, 1)
  on conflict (window_start) do update
    set request_count = public.quote_rate_limit.request_count + 1
  returning request_count into v_count;

  if v_count > v_max then
    raise exception using errcode = '42901', message = 'Massa consultes de preu; torneu-ho a provar més tard';
  end if;
end;
$$;

revoke all on function public.enforce_quote_rate_limit() from public, anon, authenticated;

create or replace function public.calculate_stay_quote(
  p_arrival date,
  p_departure date,
  p_adults integer,
  p_children integer default 0,
  p_infants integer default 0
)
returns jsonb
language plpgsql
-- No longer STABLE: it now conditionally writes a rate-limit counter, a
-- real side effect that STABLE's contract (same result, no writes, safely
-- cacheable within one statement) explicitly rules out.
volatile
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
  -- Only the direct, anonymous, public-facing call is throttled — not the
  -- internal call create_reservation_request makes while actually booking
  -- (that runs as service_role, already gated at the edge-function layer).
  if auth.role() = 'anon' then
    perform public.enforce_quote_rate_limit();
  end if;

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

-- create-or-replace keeps prior grants, but state it explicitly since the
-- signature and volatility both changed.
revoke all on function public.calculate_stay_quote(date,date,integer,integer,integer) from public;
grant execute on function public.calculate_stay_quote(date,date,integer,integer,integer) to anon, authenticated;
