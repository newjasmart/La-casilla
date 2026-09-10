import Link from "next/link";
import styles from "./site-shell.module.css";

const navigation = [
  { label: "La casa", href: "#descobrir" },
  { label: "Fotos", href: "#fotos" },
  { label: "Disponibilitat", href: "#reserva" },
  { label: "Contacte", href: "#contacte" },
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
            {navigation.map((item) => (
              <li key={item.href}>
                <Link className={styles.navigationLink} href={`/${item.href}`}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className={styles.bookingLink} href="/#reserva">Reservar</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
