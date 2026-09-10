"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAdminAuth } from "@/components/admin/auth-provider";
import styles from "@/app/admin/admin.module.css";

export function AdminShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useAdminAuth();

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/admin">La Casilla · Gestió</Link>
        <div className={styles.who}>
          <span>{session?.user.email}</span>
          <button type="button" onClick={() => signOut()}>Tanca la sessió</button>
        </div>
      </div>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
