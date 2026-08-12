-- =========================================================================
-- Dades de demostració en català
-- =========================================================================

-- HABITACIONS -------------------------------------------------------------
insert into public.rooms (nom, descripcio, preu, capacitat, superficie, serveis, ordre) values
  ('Habitació Doble Estàndard',
   'Habitació acollidora amb llit doble i vistes al jardí. Ideal per a una escapada en parella.',
   75.00, 2, 18,
   array['Wifi','Bany privat','Esmorzar inclòs','Calefacció'],
   1),
  ('Habitació Doble Superior',
   'Habitació espaiosa amb llit king-size, balcó privat i vistes a la muntanya.',
   95.00, 2, 24,
   array['Wifi','Bany privat','Esmorzar inclòs','Balcó','Vistes muntanya','Calefacció'],
   2),
  ('Suite Familiar',
   'Suite amb dues habitacions comunicades, perfecta per a famílies amb nens.',
   140.00, 4, 35,
   array['Wifi','Bany privat','Esmorzar inclòs','Vistes muntanya','Saló','Calefacció'],
   3),
  ('Habitació Individual',
   'Habitació còmoda per a una persona, amb tot el necessari per a una estada tranquil·la.',
   55.00, 1, 12,
   array['Wifi','Bany privat','Esmorzar inclòs','Calefacció'],
   4);

-- MENU --------------------------------------------------------------------
insert into public.menu_items (categoria, nom, descripcio, preu, alergens, ordre) values
  ('entrants', 'Amanida de formatges de muntanya',
   'Selecció de formatges artesans amb nous, mel i pa torrat.', 12.00,
   array['lactis','fruits secs','gluten'], 1),
  ('entrants', 'Crema de carbassa amb castanyes',
   'Crema casolana amb un toc de canyella i castanyes torrades.', 9.50,
   array['fruits secs'], 2),
  ('entrants', 'Embotits de la vall',
   'Plat de pernil curat, fuet i llonganissa local.', 14.00,
   array[]::text[], 3),

  ('plats', 'Confit d''ànec amb patates',
   'Cuixa d''ànec confitada amb patates al forn i romaní.', 18.00,
   array[]::text[], 1),
  ('plats', 'Trinxat de la Cerdanya',
   'Plat tradicional amb col, patata i cansalada.', 14.00,
   array[]::text[], 2),
  ('plats', 'Truita de muntanya',
   'Truita fresca a la planxa amb ametlles i mantega.', 19.00,
   array['peix','fruits secs','lactis'], 3),
  ('plats', 'Civet de senglar',
   'Estofat tradicional amb vi negre i bolets de bosc.', 21.00,
   array['sulfits'], 4),

  ('postres', 'Mel i mató',
   'Mató fresc de cabra amb mel del Pirineu.', 6.50,
   array['lactis'], 1),
  ('postres', 'Crema catalana',
   'Recepta de la casa, caramel·litzada al moment.', 6.00,
   array['lactis','ous'], 2),
  ('postres', 'Pastís de poma casolà',
   'Amb gelat de vainilla.', 7.00,
   array['gluten','lactis','ous'], 3),

  ('begudes', 'Vi negre de la comarca (copa)', 'Selecció del sommelier.', 4.50, array['sulfits'], 1),
  ('begudes', 'Aigua mineral 1L',              '',                       3.00, array[]::text[], 2),
  ('begudes', 'Cafè',                          '',                       1.80, array[]::text[], 3),
  ('begudes', 'Infusió',                       'Selecció d''herbes locals.', 2.50, array[]::text[], 4);

-- EXCURSIONS --------------------------------------------------------------
insert into public.hikes (nom, descripcio, distancia, durada, dificultat, desnivell, punt_inici) values
  ('Tour de l''Estany',
   'Volta tranquil·la al voltant de l''estany amb vistes panoràmiques.',
   8.0, '2h 30 min', 'facil', 120, 'Aparcament de l''estany'),
  ('Cim del Puig Major',
   'Pujada exigent fins al cim amb vistes de 360°.',
   14.5, '6h', 'dificil', 1100, 'Refugi de la vall'),
  ('Ruta de les Cascades',
   'Itinerari per dins del bosc passant per tres salts d''aigua.',
   6.2, '2h', 'mitjana', 350, 'Pont vell del riu'),
  ('Camí dels Pastors',
   'Antic camí tradicional entre prats i bordes de pedra.',
   10.0, '3h 30 min', 'mitjana', 480, 'Plaça del poble');

-- RUTES DE BICI -----------------------------------------------------------
insert into public.bike_routes (nom, descripcio, distancia, desnivell, dificultat, durada, tipus) values
  ('Col de muntanya',
   'Pujada llegendària per a ciclistes de carretera, amb pendents constants.',
   45.0, 900, 'dificil', '3h 30 min', 'carretera'),
  ('Ruta del riu (BTT)',
   'Itinerari familiar al costat del riu, majoritàriament pla.',
   22.0, 180, 'facil', '2h', 'btt'),
  ('Travessa dels boscos',
   'Recorregut de BTT amb pujades curtes però tècniques.',
   35.0, 650, 'mitjana', '3h', 'btt'),
  ('Gran Tour de la vall',
   'Ruta gravel per descobrir tots els pobles de la comarca.',
   60.0, 1100, 'dificil', '5h', 'gravel');

-- RESSENYES (algunes ja aprovades per mostrar a la web) -------------------
insert into public.reviews (nom, nota, comentari, aprovada) values
  ('Marta i Jordi', 5,
   'Una estada meravellosa! Els amfitrions són encantadors i l''esmorzar casolà és espectacular. Tornarem segur.',
   true),
  ('Família García', 5,
   'Perfecte per venir amb nens. La suite familiar és molt còmoda i hi ha moltes activitats per fer al voltant.',
   true),
  ('Pierre L.', 4,
   'Très bon accueil, chambres impeccables et vue magnifique sur la montagne. Le menu du soir vaut le détour.',
   true),
  ('Anna M.', 5,
   'Tranquil·litat absoluta, natura i molt bon menjar. Recomanat 100%.',
   true);

-- FOTOS (exemples; cal substituir per URLs reals del bucket) --------------
insert into public.photos (album, titol, ordre) values
  ('casa',         'Façana principal', 1),
  ('casa',         'Jardí',            2),
  ('habitacions',  'Suite Familiar',   1),
  ('piscina',      'Piscina exterior', 1),
  ('restaurant',   'Sala del menjador',1),
  ('excursions',   'Estany al matí',   1),
  ('bici',         'Sortida en grup',  1);
