-- DEV-only fictitious seed. Never load this file into PRE or PROD.

insert into public.properties (
  id, max_guests, max_infants, base_nightly_price, base_minimum_nights,
  currency, timezone, minimum_advance_days, booking_horizon_days,
  request_hold_minutes, active
) values (
  1, 8, 2, 180.00, 2, 'EUR', 'Europe/Madrid', 1, 730, 1440, true
);

insert into public.property_content (
  property_id, name, slug, description, bedrooms, bathrooms,
  amenities, check_in_time, check_out_time, published
) values (
  1, 'La Casilla DEV', 'la-casilla-dev',
  'Donnée fictive pour tester localement la location de la maison entière.',
  4, 2.0, array['wifi','jardin','cuisine','parking'], '16:00', '11:00', true
);

insert into public.rate_periods (
  property_id, name, stay_period, nightly_price, minimum_nights, priority
) values
  (1, 'Haute saison DEV', daterange('2027-07-01', '2027-09-01', '[)'), 240.00, 5, 10),
  (1, 'Fête DEV', daterange('2027-08-14', '2027-08-18', '[)'), 300.00, 4, 20);

insert into public.fee_rules (
  property_id, code, label, calculation, amount, valid_period, sort_order
) values
  (1, 'cleaning', 'Frais de ménage DEV', 'per_stay', 60.00, null, 10);

insert into public.reviews (
  property_id, display_name, rating, comment, source, stay_month,
  published, published_at
) values (
  1, 'Voyageur DEV', 5, 'Avis entièrement fictif pour les tests locaux.',
  'dev_seed', '2026-01-01', true, now()
);

-- No users, contacts, reservations, calendar blocks, payments or media objects.
