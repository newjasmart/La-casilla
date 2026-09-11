"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminAuth } from "@/components/admin/auth-provider";

/**
 * Client-side redirect only, for UX: it avoids flashing admin pages at
 * signed-out or non-staff visitors. It is NOT the security boundary — every
 * table read or write the admin pages perform still goes through Postgres
 * RLS (`has_staff_role(...)`), which is what actually protects the data.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, isStaff, loading, signOut } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/admin/login");
      return;
    }
    if (isStaff === false) {
      // A real account, but not a staff member — RLS would block every read
      // anyway, but bounce them out cleanly rather than show empty tables.
      // Sign out first so the login page isn't just handed straight back
      // into the same non-staff session.
      void signOut().then(() => router.replace("/admin/login"));
    }
  }, [loading, session, isStaff, router, signOut]);

  if (loading || !session || isStaff !== true) return <p>Carregant…</p>;
  return <>{children}</>;
}
