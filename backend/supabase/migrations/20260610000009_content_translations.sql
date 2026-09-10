-- La Casilla — per-locale translations for guest-facing free text.
--
-- The canonical `description` / `comment` columns stay the property's
-- original-language text (whatever Marc, or a guest, actually wrote).
-- Translations are optional per-locale overrides keyed by the same locale
-- codes the public site uses (ca/es/en/nl/fr). A missing key falls back to
-- the canonical text — nothing is required to keep working.

create or replace function public.valid_translation_locales(value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select bool_and(key in ('ca', 'es', 'en', 'nl', 'fr')) from jsonb_object_keys(value) as key),
    true
  );
$$;

alter table public.property_content
  add column description_translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(description_translations) = 'object');
alter table public.property_content
  add constraint property_content_translation_locales
  check (public.valid_translation_locales(description_translations));

alter table public.reviews
  add column comment_translations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(comment_translations) = 'object');
alter table public.reviews
  add constraint reviews_translation_locales
  check (public.valid_translation_locales(comment_translations));

revoke all on function public.valid_translation_locales(jsonb) from public;
grant execute on function public.valid_translation_locales(jsonb) to anon, authenticated, service_role;
