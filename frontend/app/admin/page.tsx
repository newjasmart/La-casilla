"use client";

import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import styles from "@/app/admin/admin.module.css";

export default function AdminHomePage() {
  return (
    <RequireStaff>
      <AdminShell>
        <div className={styles.pageHeader}>
          <h1>Gestió de La Casilla</h1>
        </div>
        <nav className={styles.dashboardNav}>
          <Link className={styles.dashboardCard} href="/admin/preus">
            Preus i tarifes
            <span>Preu base, temporades i suplements.</span>
          </Link>
          <Link className={styles.dashboardCard} href="/admin/reserves">
            Reserves
            <span>Consultar, confirmar o cancel·lar sol·licituds.</span>
          </Link>
          <Link className={styles.dashboardCard} href="/admin/contingut">
            Contingut
            <span>Text, equipaments i horaris de la pàgina pública.</span>
          </Link>
          <Link className={styles.dashboardCard} href="/admin/fotos">
            Fotos
            <span>Pujar, publicar i ordenar les imatges.</span>
          </Link>
          <Link className={styles.dashboardCard} href="/admin/ressenyes">
            Ressenyes
            <span>Afegir i publicar els comentaris dels hostes.</span>
          </Link>
        </nav>
      </AdminShell>
    </RequireStaff>
  );
}
