import Link from "next/link";
import styles from "./site-shell.module.css";

const plannedRoutes = [
  "Disponibilités",
  "Réservation",
  "Contact",
  "Devis",
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="La Casilla, accueil">
          La Casilla
        </Link>
        <nav aria-label="Navigation principale">
          <ul className={styles.navigation}>
            {plannedRoutes.map((label) => (
              <li key={label}>
                <span className={styles.plannedRoute} aria-disabled="true">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
