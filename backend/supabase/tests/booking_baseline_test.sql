begin;
select plan(23);

select has_table('public', 'properties', 'whole property exists');
select hasnt_table('public', 'rooms', 'rooms domain was removed');
select has_table('public', 'calendar_entries', 'shared calendar exists');
select has_table('public', 'reservations', 'reservations exist');
select has_function('public', 'calculate_stay_quote', array['date','date','integer','integer','integer'], 'quote function exists');
select has_function('public', 'create_reservation_request', array[
  'text','text','text','text','date','date','integer','integer','integer',
  'text','text','timestamp with time zone','text','text'
], 'atomic reservation function exists');

select is((public.calculate_stay_quote('2027-06-10','2027-06-12',2,0,0)->>'total_amount')::numeric, 420.00::numeric,
  'base price plus one per-stay cleaning fee');
select is((public.calculate_stay_quote('2027-07-01','2027-07-06',2,1,0)->>'total_amount')::numeric, 1260.00::numeric,
  'season rate applies to every night');
select throws_ok(
  $$select public.calculate_stay_quote('2027-07-01','2027-07-03',2,0,0)$$,
  '22023', 'MINIMUM_NIGHTS_NOT_MET', 'season minimum nights enforced');
select throws_ok(
  $$select public.calculate_stay_quote('2027-06-10','2027-06-12',8,1,0)$$,
  '22023', 'CAPACITY_EXCEEDED', 'adults plus children capacity enforced');
select throws_ok(
  $$select public.calculate_stay_quote('2027-06-10','2027-06-12',2,0,3)$$,
  '22023', 'CAPACITY_EXCEEDED', 'infant capacity enforced separately');

select lives_ok(
  $$select public.create_calendar_block('2027-10-01','2027-10-04','manual','DEV maintenance')$$,
  'manual block can be created');
select is(public.is_stay_available('2027-10-01','2027-10-03',2,0,0), false,
  'manual block makes the stay unavailable');
select throws_ok(
  $$select public.create_calendar_block('2027-10-02','2027-10-05','maintenance','overlap')$$,
  '23P01', 'CALENDAR_CONFLICT', 'overlapping block is rejected atomically');

select lives_ok($$
  select public.create_reservation_request(
    'Persona','DEV','dev@example.test',null,'2027-11-01','2027-11-03',
    2,0,0,null,'ca',now(),'website',null
  )
$$, 'whole-house request is created');
select is(public.is_stay_available('2027-11-01','2027-11-03',2,0,0), false,
  'created request blocks the dates');
select throws_ok($$
  select public.create_reservation_request(
    'Altra','DEV','other@example.test',null,'2027-11-02','2027-11-04',
    2,0,0,null,'ca',now(),'website',null
  )
$$, '23P01', 'STAY_NOT_AVAILABLE', 'overlapping request is rejected');
select is((select count(*) from public.reservations where arrival_date = '2027-11-01'), 1::bigint,
  'only one concurrent date owner exists');

select lives_ok($$
  select public.transition_reservation(
    (select id from public.reservations where arrival_date = '2027-11-01'),
    'confirmed', null
  )
$$, 'request can be confirmed');
select ok((
  select c.expires_at is null
  from public.reservations r join public.calendar_entries c on c.id = r.calendar_entry_id
  where r.arrival_date = '2027-11-01'
), 'confirmed reservation no longer expires');
select throws_ok($$
  select public.transition_reservation(
    (select id from public.reservations where arrival_date = '2027-11-01'),
    'requested', null
  )
$$, '22023', 'INVALID_STATUS_TRANSITION', 'invalid backward transition is rejected');

-- calculate_stay_quote throttles the anonymous, public-facing caller once it
-- is hammered, but never the trusted internal path a real booking takes.
insert into public.quote_rate_limit(window_start, request_count)
values (date_trunc('hour', clock_timestamp()), 500);
set local "request.jwt.claim.role" = 'anon';
select throws_ok(
  $$select public.calculate_stay_quote('2027-12-01','2027-12-03',2,0,0)$$,
  '42901', 'Massa consultes de preu; torneu-ho a provar més tard',
  'a hammered anonymous caller is throttled'
);
reset "request.jwt.claim.role";
select lives_ok(
  $$select public.calculate_stay_quote('2027-12-01','2027-12-03',2,0,0)$$,
  'the same exhausted window never throttles a trusted (non-anon) caller'
);

select * from finish();
rollback;
