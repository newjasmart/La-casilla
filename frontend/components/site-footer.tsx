import styles from "./site-shell.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerBrand}>La Casilla</p>
        <p>Un lieu pour ralentir et se retrouver.</p>
      </div>
    </footer>
  );
}
