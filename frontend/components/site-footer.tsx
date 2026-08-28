import styles from "./site-shell.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerBrand}>La Casilla</p>
        <p>Un lloc per aturar-se i retrobar-se.</p>
      </div>
    </footer>
  );
}
