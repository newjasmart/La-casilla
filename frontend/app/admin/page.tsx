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
          <span className={styles.dashboardCardDisabled}>
            Contingut i fotos
            <span>Properament.</span>
          </span>
          <span className={styles.dashboardCardDisabled}>
            Ressenyes
            <span>Properament.</span>
          </span>
        </nav>
      </AdminShell>
    </RequireStaff>
  );
}
