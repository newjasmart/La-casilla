-- La Casilla — least-privilege RLS and explicit grants.

create or replace function public.has_staff_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff_members
    where user_id = auth.uid() and active and role = any(p_roles)
  );
$$;
revoke all on function public.has_staff_role(text[]) from public;
grant execute on function public.has_staff_role(text[]) to authenticated;

-- Public catalog: only published, non-sensitive content.
create policy property_public_read on public.properties for select to anon, authenticated using (active);
create policy property_admin_manage on public.properties for all to authenticated
  using (public.has_staff_role(array['admin','technical_admin']))
  with check (public.has_staff_role(array['admin','technical_admin']));

create policy property_content_public_read on public.property_content for select to anon, authenticated using (published);
create policy property_content_staff_manage on public.property_content for all to authenticated
  using (public.has_staff_role(array['admin','content_editor','technical_admin']))
  with check (public.has_staff_role(array['admin','content_editor','technical_admin']));

create policy media_public_read on public.property_media for select to anon, authenticated using (published);
create policy media_staff_manage on public.property_media for all to authenticated
  using (public.has_staff_role(array['admin','content_editor','technical_admin']))
  with check (public.has_staff_role(array['admin','content_editor','technical_admin']));

create policy reviews_public_read on public.reviews for select to anon, authenticated using (published);
create policy reviews_staff_manage on public.reviews for all to authenticated
  using (public.has_staff_role(array['admin','content_editor','technical_admin']))
  with check (public.has_staff_role(array['admin','content_editor','technical_admin']));

-- PII and commercial operations: Marc/admin and technical admin only.
create policy staff_admin_read on public.staff_members for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));
create policy staff_technical_manage on public.staff_members for all to authenticated
  using (public.has_staff_role(array['technical_admin']))
  with check (public.has_staff_role(array['technical_admin']));

create policy contacts_admin_manage on public.contacts for all to authenticated
  using (public.has_staff_role(array['admin','technical_admin']))
  with check (public.has_staff_role(array['admin','technical_admin']));
create policy rates_admin_manage on public.rate_periods for all to authenticated
  using (public.has_staff_role(array['admin','technical_admin']))
  with check (public.has_staff_role(array['admin','technical_admin']));
create policy fees_admin_manage on public.fee_rules for all to authenticated
  using (public.has_staff_role(array['admin','technical_admin']))
  with check (public.has_staff_role(array['admin','technical_admin']));
create policy calendar_admin_read on public.calendar_entries for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));
create policy calendar_admin_insert_blocks on public.calendar_entries for insert to authenticated
  with check (
    kind in ('manual','maintenance','external')
    and public.has_staff_role(array['admin','technical_admin'])
  );
create policy calendar_admin_update_blocks on public.calendar_entries for update to authenticated
  using (
    kind in ('manual','maintenance','external')
    and public.has_staff_role(array['admin','technical_admin'])
  ) with check (
    kind in ('manual','maintenance','external')
    and public.has_staff_role(array['admin','technical_admin'])
  );
create policy calendar_admin_delete_blocks on public.calendar_entries for delete to authenticated
  using (
    kind in ('manual','maintenance','external')
    and public.has_staff_role(array['admin','technical_admin'])
  );
create policy reservations_admin_read on public.reservations for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));
create policy reservations_admin_update on public.reservations for update to authenticated
  using (public.has_staff_role(array['admin','technical_admin']))
  with check (public.has_staff_role(array['admin','technical_admin']));
create policy reservation_history_admin_read on public.reservation_status_history for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));
create policy payments_admin_read on public.payment_intents for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));
create policy channels_technical_manage on public.channel_sync_state for all to authenticated
  using (public.has_staff_role(array['technical_admin']))
  with check (public.has_staff_role(array['technical_admin']));
create policy channel_conflicts_admin_read on public.channel_sync_conflicts for select to authenticated
  using (public.has_staff_role(array['admin','technical_admin']));

-- Public RPCs disclose availability and prices, never calendar details or PII.
grant execute on function public.calculate_stay_quote(date,date,integer,integer,integer) to anon, authenticated;
grant execute on function public.is_stay_available(date,date,integer,integer,integer) to anon, authenticated;
grant execute on function public.create_reservation_request(text,text,text,text,date,date,integer,integer,integer,text,text,timestamptz,text,text) to service_role;
grant execute on function public.create_calendar_block(date,date,text,text,text,text) to service_role;
grant execute on function public.transition_reservation(uuid,text,text) to service_role;

-- Keep direct table writes closed to anon. Edge Functions use service_role.
revoke all on public.contacts, public.calendar_entries, public.reservations,
  public.reservation_status_history, public.payment_intents,
  public.channel_sync_state, public.channel_sync_conflicts from anon;

create policy storage_property_media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'property-media');
create policy storage_property_media_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'property-media' and public.has_staff_role(array['admin','content_editor','technical_admin']));
create policy storage_property_media_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'property-media' and public.has_staff_role(array['admin','content_editor','technical_admin']))
  with check (bucket_id = 'property-media' and public.has_staff_role(array['admin','content_editor','technical_admin']));
create policy storage_property_media_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'property-media' and public.has_staff_role(array['admin','content_editor','technical_admin']));
