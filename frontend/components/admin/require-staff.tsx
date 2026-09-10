"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminAuth } from "@/components/admin/auth-provider";

/**
 * Client-side redirect only, for UX: it avoids flashing admin pages at
 * signed-out visitors. It is NOT the security boundary — every table read or
 * write the admin pages perform still goes through Postgres RLS
 * (`has_staff_role(...)`), which is what actually protects the data.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, loading } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/admin/login");
  }, [loading, session, router]);

  if (loading) return <p>Carregant…</p>;
  if (!session) return null;
  return <>{children}</>;
}
