-- =========================================================================
-- Storage: buckets públics per a la web pública
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('habitacions', 'habitacions', true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('galeria',     'galeria',     true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('menu',        'menu',        true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('excursions',  'excursions',  true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('bici',        'bici',        true, 10485760, array['image/jpeg','image/png','image/webp','image/avif']),
  ('gpx',         'gpx',         true, 5242880,  array['application/gpx+xml','application/octet-stream','text/xml'])
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- Lectura pública per a tots els buckets (la web ho necessita)
-- -------------------------------------------------------------------------
create policy "Lectura pública dels fitxers"
on storage.objects for select
to public
using (
  bucket_id in ('habitacions','galeria','menu','excursions','bici','gpx')
);

-- -------------------------------------------------------------------------
-- Escriptura reservada al propietari (rol authenticated)
-- -------------------------------------------------------------------------
create policy "Pujada només per usuaris autenticats"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('habitacions','galeria','menu','excursions','bici','gpx')
);

create policy "Actualització només per usuaris autenticats"
on storage.objects for update
to authenticated
using (
  bucket_id in ('habitacions','galeria','menu','excursions','bici','gpx')
);

create policy "Esborrat només per usuaris autenticats"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('habitacions','galeria','menu','excursions','bici','gpx')
);
