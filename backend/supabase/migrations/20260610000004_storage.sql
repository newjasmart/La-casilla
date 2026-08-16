-- La Casilla — storage for the whole property only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-media', 'property-media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policies are deliberately created in 00005, after staff authorization exists.
