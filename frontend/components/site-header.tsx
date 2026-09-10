import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import styles from "./site-shell.module.css";

export function SiteHeader() {
  const t = useTranslations("Nav");

  const navigation = [
    { label: t("home"), href: "#descobrir" },
    { label: t("photos"), href: "#fotos" },
    { label: t("availability"), href: "#reserva" },
    { label: t("contact"), href: "#contacte" },
  ] as const;

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label={t("brandAria")}>
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
              <Link className={styles.bookingLink} href="/#reserva">{t("book")}</Link>
            </li>
            <li>
              <LanguageSwitcher />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
