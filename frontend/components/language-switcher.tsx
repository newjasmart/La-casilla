"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import styles from "./site-shell.module.css";

const LOCALE_LABELS: Record<string, string> = {
  ca: "Català",
  es: "Español",
  en: "English",
  nl: "Nederlands",
  fr: "Français",
};

export function LanguageSwitcher() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        // Standard listbox behaviour: Escape returns focus to the trigger
        // rather than leaving a keyboard user stranded with nothing focused.
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    // Closes when focus truly leaves the widget (e.g. Tab past the last
    // option) — without this, a keyboard user could tab away and leave the
    // menu visually open with nothing pointing at it.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  function selectLocale(nextLocale: string) {
    setOpen(false);
    router.replace(
      // @ts-expect-error -- pathname is typed against the known routes, but
      // here it's whatever the current URL happens to be.
      { pathname, params },
      { locale: nextLocale },
    );
  }

  return (
    <div className={styles.languageSwitcher} ref={containerRef} onBlur={handleBlur}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.languageButton}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">🌐</span>
        <span className={styles.languageCode}>{locale.toUpperCase()}</span>
      </button>
      {open && (
        <ul className={styles.languageMenu} role="listbox">
          {routing.locales.map((item) => (
            <li key={item}>
              <button
                type="button"
                role="option"
                aria-selected={item === locale}
                className={item === locale ? styles.languageOptionActive : styles.languageOption}
                onClick={() => selectLocale(item)}
              >
                {LOCALE_LABELS[item]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
