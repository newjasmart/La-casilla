import { useTranslations } from "next-intl";
import styles from "./site-shell.module.css";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerBrand}>La Casilla</p>
        <p>{t("tagline")}</p>
      </div>
    </footer>
  );
}
