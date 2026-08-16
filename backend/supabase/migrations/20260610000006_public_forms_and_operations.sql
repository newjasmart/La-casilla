-- La Casilla — public form protection, operational audit and maintenance.

create table public.public_form_rate_limits (
  endpoint        text not null check (endpoint in ('contact', 'reservation')),
  client_hash     text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start    timestamptz not null,
  request_count   integer not null check (request_count > 0),
  updated_at      timestamptz not null default now(),
  primary key (endpoint, client_hash, window_start)
);

create table public.public_form_idempotency (
  endpoint             text not null check (endpoint in ('contact', 'reservation')),
  key_hash             text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  request_fingerprint  text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  state                text not null default 'processing' check (state in ('processing', 'completed')),
  response_status      integer,
  response_body        jsonb check (response_body is null or pg_column_size(response_body) <= 16384),
  created_at           timestamptz not null default now(),
  completed_at         timestamptz,
  primary key (endpoint, key_hash),
  constraint completed_response_present check (
    (state = 'processing' and response_status is null and response_body is null and completed_at is null)
    or (state = 'completed' and response_status between 100 and 599
        and response_body is not null and completed_at is not null)
  )
);

create index idx_public_form_rate_limits_updated on public.public_form_rate_limits(updated_at);
create index idx_public_form_idempotency_created on public.public_form_idempotency(created_at);

alter table public.public_form_rate_limits enable row level security;
alter table public.public_form_idempotency enable row level security;

create or replace function public.claim_public_form_request(
  p_endpoint text,
  p_key_hash text,
  p_request_fingerprint text,
  p_client_hash text,
  p_max_requests integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.public_form_idempotency%rowtype;
  v_window_start timestamptz;
  v_count integer;
begin
  if p_endpoint not in ('contact', 'reservation')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_max_requests < 1 or p_window_seconds < 1 then
    raise exception using errcode = '22023', message = 'INVALID_PUBLIC_FORM_CLAIM';
  end if;

  insert into public.public_form_idempotency(endpoint, key_hash, request_fingerprint)
  values (p_endpoint, p_key_hash, p_request_fingerprint)
  on conflict (endpoint, key_hash) do nothing;

  if not found then
    select * into v_existing from public.public_form_idempotency
    where endpoint = p_endpoint and key_hash = p_key_hash;
    if v_existing.request_fingerprint <> p_request_fingerprint then
      return jsonb_build_object('outcome', 'conflict');
    elsif v_existing.state = 'completed' then
      return jsonb_build_object(
        'outcome', 'replay', 'response_status', v_existing.response_status,
        'response_body', v_existing.response_body
      );
    else
      return jsonb_build_object('outcome', 'processing');
    end if;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  insert into public.public_form_rate_limits(endpoint, client_hash, window_start, request_count)
  values (p_endpoint, p_client_hash, v_window_start, 1)
  on conflict (endpoint, client_hash, window_start) do update
    set request_count = public.public_form_rate_limits.request_count + 1,
        updated_at = now()
    where public.public_form_rate_limits.request_count < p_max_requests
  returning request_count into v_count;

  if v_count is null then
    update public.public_form_idempotency
    set state = 'completed', response_status = 429,
        response_body = '{"error":"Massa peticions; torna-ho a provar més tard"}'::jsonb,
        completed_at = now()
    where endpoint = p_endpoint and key_hash = p_key_hash;
    return jsonb_build_object(
      'outcome', 'rate_limited', 'response_status', 429,
      'response_body', jsonb_build_object('error', 'Massa peticions; torna-ho a provar més tard')
    );
  end if;
  return jsonb_build_object('outcome', 'claimed');
end;
$$;

create or replace function public.complete_public_form_request(
  p_endpoint text,
  p_key_hash text,
  p_request_fingerprint text,
  p_response_status integer,
  p_response_body jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_response_status not between 100 and 599 or p_response_body is null then
    raise exception using errcode = '22023', message = 'INVALID_PUBLIC_FORM_RESPONSE';
  end if;
  update public.public_form_idempotency
  set state = 'completed', response_status = p_response_status,
      response_body = p_response_body, completed_at = now()
  where endpoint = p_endpoint and key_hash = p_key_hash
    and request_fingerprint = p_request_fingerprint and state = 'processing';
  return found;
end;
$$;

-- Minimal audit metadata only. No contact, reservation or payment values are copied.
create table public.audit_events (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_audit_events_entity on public.audit_events(entity_type, entity_id, created_at desc);
alter table public.audit_events enable row level security;
create policy audit_admin_read on public.audit_events for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));

create or replace function public.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id text;
begin
  if tg_op = 'DELETE' then
    v_id := old.id::text;
  else
    v_id := new.id::text;
  end if;
  insert into public.audit_events(entity_type, entity_id, action, actor_id)
  values (tg_table_name, v_id, tg_op, auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_audit_properties after insert or update or delete on public.properties
  for each row execute function public.record_audit_event();
create trigger trg_audit_rate_periods after insert or update or delete on public.rate_periods
  for each row execute function public.record_audit_event();
create trigger trg_audit_fee_rules after insert or update or delete on public.fee_rules
  for each row execute function public.record_audit_event();
create trigger trg_audit_calendar_entries after insert or update or delete on public.calendar_entries
  for each row execute function public.record_audit_event();
create trigger trg_audit_reservations after insert or update or delete on public.reservations
  for each row execute function public.record_audit_event();

create or replace function public.cleanup_operational_data()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint := 0;
  v_count bigint;
begin
  update public.reservations r set status = 'expired'
  from public.calendar_entries c
  where r.calendar_entry_id = c.id and r.status in ('requested', 'payment_pending')
    and c.state = 'active' and c.expires_at <= now();
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from public.public_form_idempotency where created_at < now() - interval '7 days';
  get diagnostics v_count = row_count; v_total := v_total + v_count;
  delete from public.public_form_rate_limits where updated_at < now() - interval '7 days';
  get diagnostics v_count = row_count; v_total := v_total + v_count;
  return v_total;
end;
$$;

revoke all on function public.claim_public_form_request(text,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.complete_public_form_request(text,text,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.cleanup_operational_data() from public, anon, authenticated;
grant execute on function public.claim_public_form_request(text,text,text,text,integer,integer) to service_role;
grant execute on function public.complete_public_form_request(text,text,text,integer,jsonb) to service_role;
grant execute on function public.cleanup_operational_data() to service_role;

create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'la-casilla-daily-maintenance') then
    perform cron.schedule(
      'la-casilla-daily-maintenance', '17 3 * * *',
      'select public.cleanup_operational_data()'
    );
  end if;
end;
$$;
