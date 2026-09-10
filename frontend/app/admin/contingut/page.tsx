"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import useSWR from "swr";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TRANSLATABLE_LOCALES, type AdminPropertyContent, type TranslatableLocale } from "@/types/admin";
import styles from "@/app/admin/admin.module.css";

const LOCALE_LABELS: Record<TranslatableLocale, string> = {
  es: "Castellà (es)",
  en: "Anglès (en)",
  nl: "Neerlandès (nl)",
  fr: "Francès (fr)",
};

const KNOWN_AMENITY_CODES = [
  "wifi", "garden", "kitchen", "parking", "pool", "air_conditioning", "heating",
  "washing_machine", "dishwasher", "fireplace", "bbq", "dryer", "tv", "workspace",
  "bikes_welcome", "pets_allowed", "crib", "high_chair",
] as const;

export default function AdminContentPage() {
  return (
    <RequireStaff>
      <AdminShell>
        <ContentPageContent />
      </AdminShell>
    </RequireStaff>
  );
}

async function fetchContent(): Promise<AdminPropertyContent | null> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("property_content")
    .select("*")
    .eq("property_id", 1)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  return data as AdminPropertyContent | null;
}

function normalizeTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

function ContentPageContent() {
  const { data, error, isLoading, mutate } = useSWR("admin-content", fetchContent);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Contingut de la casa</h1>
        <Link className={styles.backLink} href="/admin">← Tornar a la gestió</Link>
      </div>

      {isLoading && <p>Carregant…</p>}
      {error && <p className={styles.error} role="alert">{error instanceof Error ? error.message : "No s’han pogut carregar les dades."}</p>}

      {!isLoading && !error && (
        <ContentForm content={data ?? null} onSaved={() => mutate()} />
      )}
    </>
  );
}

function ContentForm({
  content,
  onSaved,
}: {
  content: AdminPropertyContent | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(content?.name ?? "");
  const [slug, setSlug] = useState(content?.slug ?? "la-casilla");
  const [description, setDescription] = useState(content?.description ?? "");
  const [descriptionTranslations, setDescriptionTranslations] = useState<Partial<Record<TranslatableLocale, string>>>(
    content?.description_translations ?? {},
  );
  const [bedrooms, setBedrooms] = useState(String(content?.bedrooms ?? 1));
  const [bathrooms, setBathrooms] = useState(String(content?.bathrooms ?? 1));
  const [amenities, setAmenities] = useState((content?.amenities ?? []).join(", "));
  const [checkIn, setCheckIn] = useState((content?.check_in_time ?? "16:00").slice(0, 5));
  const [checkOut, setCheckOut] = useState((content?.check_out_time ?? "11:00").slice(0, 5));
  const [published, setPublished] = useState(content?.published ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const cleanedTranslations = Object.fromEntries(
      Object.entries(descriptionTranslations)
        .map(([locale, text]) => [locale, text?.trim() ?? ""])
        .filter(([, text]) => text),
    );

    const payload = {
      property_id: 1,
      name,
      slug,
      description: description.trim() || null,
      description_translations: cleanedTranslations,
      bedrooms: Number(bedrooms),
      bathrooms: Number(bathrooms),
      amenities: amenities.split(",").map((item) => item.trim()).filter(Boolean),
      check_in_time: normalizeTime(checkIn),
      check_out_time: normalizeTime(checkOut),
      published,
    };

    const { error: saveError } = await getSupabaseBrowserClient()
      .from("property_content")
      .upsert(payload, { onConflict: "property_id" });

    setSaving(false);
    if (saveError) {
      setError(supabaseErrorMessage(saveError));
      return;
    }
    onSaved();
    setSaved(true);
  }

  return (
    <section className={styles.section}>
      <p className={styles.sectionHint}>
        Aquest text i aquestes dades apareixen directament a la pàgina pública. Els canvis
        només es veuran si la casa es manté &quot;Publicada&quot;.
      </p>
      <div className={styles.card}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>Nom de la casa
              <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>Identificador (slug)
              <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </label>
            <label>Habitacions
              <input type="number" min="1" required value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
            </label>
            <label>Banys
              <input type="number" min="1" step="0.5" required value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
            </label>
            <label>Arribada a partir de
              <input type="time" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label>Sortida abans de
              <input type="time" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </label>
          </div>
          <label>Descripció <span>(català, per defecte)</span>
            <textarea rows={6} maxLength={10000} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className={styles.section} style={{ marginTop: 4 }}>
            <h3 style={{ fontSize: "1rem", marginBottom: 6 }}>Traduccions de la descripció</h3>
            <p className={styles.sectionHint}>
              Opcional. Si deixeu un idioma en blanc, aquest idioma mostrarà la descripció en
              català de dalt.
            </p>
            {TRANSLATABLE_LOCALES.map((locale) => (
              <label key={locale} style={{ marginTop: 10 }}>{LOCALE_LABELS[locale]}
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={descriptionTranslations[locale] ?? ""}
                  onChange={(e) => setDescriptionTranslations((current) => ({ ...current, [locale]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <label>Equipaments <span>(separats per comes)</span>
            <input value={amenities} onChange={(e) => setAmenities(e.target.value)} placeholder="wifi, garden, kitchen, parking" />
            <span className={styles.sectionHint} style={{ marginTop: 6, display: "block" }}>
              Aquests codis es tradueixen automàticament al lloc web: {KNOWN_AMENITY_CODES.join(", ")}.
              Qualsevol altra paraula es mostra tal qual, sense traducció.
            </span>
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Publicada (visible al lloc web)
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {saved && !error && <p className={styles.success} role="status">Desat correctament.</p>}
          <button className={styles.primaryButton} type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? "Desant…" : "Desa els canvis"}
          </button>
        </form>
      </div>
    </section>
  );
}
