"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "@/app/admin/admin.module.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email,
      password,
    });

    setPending(false);
    if (signInError) {
      setError("Credencials incorrectes.");
      return;
    }
    router.replace("/admin");
  }

  return (
    <main className={styles.loginWrapper}>
      <div className={styles.loginCard}>
        <h1>Accés de gestió</h1>
        <form className={styles.form} onSubmit={submit}>
          <label>
            Correu electrònic
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Contrasenya
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} type="submit" disabled={pending}>
            {pending ? "Entrant…" : "Entra"}
          </button>
        </form>
      </div>
    </main>
  );
}
