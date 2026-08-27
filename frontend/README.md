# Frontend de La Casilla

Base Next.js App Router pour le site public de La Casilla.

## Configuration

Copiez `.env.example` vers `.env.local`, puis renseignez l'URL Supabase et la clé publique anonyme. Aucune clé `service_role` ne doit être utilisée dans ce projet.

## Commandes

- `npm run dev` : serveur de développement
- `npm run build` : build de production
- `npm run lint` : contrôle ESLint
- `npm run typecheck` : contrôle TypeScript strict

## Architecture

- `app/` : routes, layout et styles globaux
- `components/` : composants d'interface partagés
- `lib/` : configuration et accès HTTP au backend
- `types/` : contrats TypeScript partagés
- `public/` : ressources statiques
