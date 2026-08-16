# Backend de La Casilla

## Baseline DEV

La base locale décrit une seule maison entière. Les six migrations couvrent le
contenu, les tarifs, le calendrier partagé, la réservation atomique, Storage,
RLS et les opérations. `supabase/seed.sql` est exclusivement fictif et réservé
à DEV.

Prérequis pour la validation PostgreSQL complète : Docker et Supabase CLI.
Après démarrage local, `npm run db:reset` applique les migrations et le seed,
puis `npm run db:test` exécute les tests pgTAP. Ne jamais utiliser `--linked`
pour ces commandes DEV.

Hypothèses configurables à confirmer avant PRE : la demande bloque 24 h,
adultes et enfants comptent dans la capacité, les bébés ont une limite séparée,
les nuits contiguës sont autorisées, le séjour minimal est le maximum des
règles traversées et les frais sont `per_stay` ou `per_night`.

## Formularis públics

`send-contact` i `send-reservation` només accepten orígens enumerats a
`ALLOWED_ORIGINS`. Cada `POST` ha d'incloure una `Idempotency-Key` única de
8–200 caràcters (`A-Z`, `a-z`, dígits, `.`, `_`, `:`, `-`). El camp honeypot
`website` ha de quedar buit. Les claus d'idempotència i les adreces client es
desen exclusivament com a hashes SHA-256 salats amb `ANTI_SPAM_HASH_SECRET`.

Estats de resposta principals:

- `200`: dades desades; una repetició exacta retorna la resposta original amb
  `Idempotent-Replayed: true`. Pot incloure `warning` si Resend falla després de desar.
- `204`: preflight CORS admès.
- `400`: JSON, dades o `Idempotency-Key` no vàlids.
- `403`: origen no inclòs a `ALLOWED_ORIGINS`.
- `404`: habitació inexistent.
- `405`: mètode no admès.
- `409`: clau reutilitzada amb dades diferents, petició igual encara en curs,
  o habitació no disponible.
- `429`: límit per client i endpoint superat; inclou `Retry-After`.
- `500`: error intern de persistència/configuració.

Per desenvolupament local es poden afegir explícitament, per exemple,
`http://localhost:3000,http://127.0.0.1:3000` a `ALLOWED_ORIGINS`. No s'accepten
comodins. La limitació utilitza les capçaleres d'adreça client normalitzades pel
proxy de Supabase; no s'ha de desplegar aquesta funció darrere d'un proxy que
permeti al client sobreescriure-les.

La funció SQL `cleanup_public_form_protection_data()` elimina hashes de més de
set dies. La migració crea el job Supabase Cron
`cleanup-public-form-protection-data`, executat cada dia a les 03:17 UTC. Després
del desplegament, cal comprovar el job i el seu historial a **Integrations → Cron**.
