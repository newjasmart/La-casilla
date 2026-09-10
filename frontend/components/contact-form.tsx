"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import {
  ContactRequestError,
  createContactRequestKey,
  sendContactRequest,
  type ContactResponse,
} from "@/lib/contact";
import styles from "./contact-form.module.css";

export function ContactForm() {
  const t = useTranslations("Contact");
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ContactResponse | null>(null);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);

  function errorMessage(caught: unknown): string {
    if (!(caught instanceof ContactRequestError)) return t("errorGeneric");
    switch (caught.code) {
      case "rateLimited": return t("errorRateLimited");
      case "forbidden": return t("errorForbidden");
      case "conflict": return t("errorConflict");
      case "validation": return t("errorValidation");
      default: return t("errorGeneric");
    }
  }

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
        locale,
      }, key);
      setResponse(result);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSending(false);
    }
  }

  if (response?.ok) {
    return (
      <section className={styles.contact} id="contacte" aria-labelledby="contact-title">
        <div className={styles.success} role="status">
          <p className={styles.kicker}>{t("successTitle")}</p>
          <h2 id="contact-title">{t("successHeading")}</h2>
          <p>{t("successBody")}</p>
          {response.warning && <p>{response.warning}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.contact} id="contacte" aria-labelledby="contact-title">
      <div className={styles.intro}>
        <p className={styles.kicker}>{t("eyebrow")}</p>
        <h2 id="contact-title">{t("title")}</h2>
        <p>{t("intro")}</p>
      </div>

      <div className={styles.panel}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>{t("name")}<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
            <label>{t("email")}<input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
            <label>{t("phone")} <span>{t("optional")}</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
            <label>{t("subject")} <span>{t("optional")}</span><input name="subject" maxLength={200} /></label>
          </div>
          <label>{t("message")}
            <textarea name="message" required minLength={5} maxLength={5000} rows={6} />
          </label>
          <label className={styles.privacy}>
            <input name="privacyAccepted" type="checkbox" required />
            {t("privacyAccept")}
          </label>
          <div className={styles.honeypot} aria-hidden="true">
            <label>{t("honeypotLabel")}<input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} type="submit" disabled={sending}>
            {sending ? t("sending") : t("send")}
          </button>
        </form>
      </div>
    </section>
  );
}
