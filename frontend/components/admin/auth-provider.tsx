"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// Every staff role that should be able to see the admin shell at all —
// page-level RLS policies still narrow what each role can actually read
// or write from there.
const ANY_STAFF_ROLE = ["admin", "technical_admin", "content_editor"];

interface AuthContextValue {
  session: Session | null;
  /** null while still checking (or no session yet) — distinct from a confirmed `false`. */
  isStaff: boolean | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    async function applySession(nextSession: Session | null) {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setIsStaff(false);
        setLoading(false);
        return;
      }
      // A logged-in Supabase user isn't necessarily staff — self-signup is
      // disabled, but this keeps the check honest rather than assuming
      // "has a session" means "is staff". The real enforcement is RLS
      // (has_staff_role) on every table; this only drives the admin UI.
      const { data, error } = await supabase.rpc("has_staff_role", { p_roles: ANY_STAFF_ROLE });
      if (!active) return;
      setIsStaff(error ? false : Boolean(data));
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      applySession(nextSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, isStaff, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAdminAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAdminAuth s’ha d’utilitzar dins d’AdminAuthProvider.");
  return context;
}
