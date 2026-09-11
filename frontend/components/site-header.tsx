"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import styles from "./site-shell.module.css";

export function SiteHeader() {
  const t = useTranslations("Nav");
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

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
        <button
          type="button"
          ref={toggleRef}
          className={styles.menuToggle}
          aria-expanded={mobileOpen}
          aria-controls="main-navigation"
          aria-label={t(mobileOpen ? "closeMenu" : "openMenu")}
          onClick={() => setMobileOpen((current) => !current)}
        >
          <span aria-hidden="true">{mobileOpen ? "✕" : "☰"}</span>
        </button>
        <nav aria-label="Navegació principal">
          <ul
            id="main-navigation"
            className={mobileOpen ? `${styles.navigation} ${styles.navigationOpen}` : styles.navigation}
          >
            {navigation.map((item) => (
              <li key={item.href}>
                <Link className={styles.navigationLink} href={`/${item.href}`} onClick={() => setMobileOpen(false)}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className={styles.bookingLink} href="/#reserva" onClick={() => setMobileOpen(false)}>{t("book")}</Link>
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
