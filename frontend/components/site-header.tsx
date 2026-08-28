import Link from "next/link";
import styles from "./site-shell.module.css";

const plannedRoutes = [
  "Disponibilitat",
  "Reserva",
  "Contacte",
  "Pressupost",
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="La Casilla, inici">
          La Casilla
        </Link>
        <nav aria-label="Navegació principal">
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
