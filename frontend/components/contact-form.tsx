"use client";

import { FormEvent, useState } from "react";
import { createContactRequestKey, sendContactRequest, type ContactResponse } from "@/lib/contact";
import styles from "./contact-form.module.css";

export function ContactForm() {
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ContactResponse | null>(null);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    setResponse(null);

    try {
      const key = requestKey ?? createContactRequestKey();
      setRequestKey(key);
      const result = await sendContactRequest({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        subject: String(form.get("subject") ?? ""),
        message: String(form.get("message") ?? ""),
        privacyAccepted: form.get("privacyAccepted") === "on",
        website: String(form.get("website") ?? ""),
      }, key);
      setResponse(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No s’ha pogut enviar el missatge.");
    } finally {
      setSending(false);
    }
  }

  if (response?.ok) {
    return (
      <section className={styles.contact} id="contacte" aria-labelledby="contact-title">
        <div className={styles.success} role="status">
          <p className={styles.kicker}>Missatge enviat</p>
          <h2 id="contact-title">Gràcies! Hem rebut el vostre missatge.</h2>
          <p>Us respondrem el més aviat possible.</p>
          {response.warning && <p>{response.warning}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.contact} id="contacte" aria-labelledby="contact-title">
      <div className={styles.intro}>
        <p className={styles.kicker}>Contacte</p>
        <h2 id="contact-title">Teniu cap pregunta abans de reservar?</h2>
        <p>
          Escriviu-nos per a qualsevol dubte sobre la casa, el grup o les dates. Us
          respondrem directament per correu.
        </p>
      </div>

      <div className={styles.panel}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>Nom<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
            <label>Correu electrònic<input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
            <label>Telèfon <span>(opcional)</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
            <label>Assumpte <span>(opcional)</span><input name="subject" maxLength={200} /></label>
          </div>
          <label>Missatge
            <textarea name="message" required minLength={5} maxLength={5000} rows={6} />
          </label>
          <label className={styles.privacy}>
            <input name="privacyAccepted" type="checkbox" required />
            Accepto que les meves dades s’utilitzin per gestionar aquesta consulta.
          </label>
          <div className={styles.honeypot} aria-hidden="true">
            <label>No empleneu aquest camp<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} type="submit" disabled={sending}>
            {sending ? "Enviant…" : "Envia el missatge"}
          </button>
        </form>
      </div>
    </section>
  );
}
