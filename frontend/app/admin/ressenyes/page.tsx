"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import useSWR from "swr";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LOCALE_DISPLAY_NAMES, TRANSLATABLE_LOCALES, type AdminReview, type TranslatableLocale } from "@/types/admin";
import styles from "@/app/admin/admin.module.css";

export default function AdminReviewsPage() {
  return (
    <RequireStaff>
      <AdminShell>
        <ReviewsPageContent />
      </AdminShell>
    </RequireStaff>
  );
}

async function fetchReviews(): Promise<AdminReview[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("reviews")
    .select("*")
    .eq("property_id", 1)
    .order("created_at", { ascending: false })
    // Explicit safety cap rather than a truly unbounded fetch — a single
    // property's review count is expected to stay well under this, but
    // nothing should silently fetch an unbounded table.
    .limit(500);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as AdminReview[];
}

function ReviewsPageContent() {
  const { data, error, isLoading, mutate } = useSWR("admin-reviews", fetchReviews);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Ressenyes</h1>
        <Link className={styles.backLink} href="/admin">← Tornar a la gestió</Link>
      </div>

      {isLoading && <p>Carregant…</p>}
      {error && <p className={styles.error} role="alert">{error instanceof Error ? error.message : "No s’han pogut carregar les ressenyes."}</p>}

      {data && (
        <>
          <ReviewsList reviews={data} onMutated={() => mutate()} />
          <AddReviewForm onAdded={() => mutate()} />
        </>
      )}
    </>
  );
}

interface ReviewDraft {
  display_name: string;
  rating: string;
  comment: string;
  comment_translations: Partial<Record<TranslatableLocale, string>>;
  source: string;
  source_url: string;
  stay_month: string;
  published: boolean;
}

function toDraft(row: AdminReview): ReviewDraft {
  return {
    display_name: row.display_name,
    rating: String(row.rating),
    comment: row.comment,
    comment_translations: row.comment_translations ?? {},
    source: row.source ?? "",
    source_url: row.source_url ?? "",
    stay_month: row.stay_month ? row.stay_month.slice(0, 7) : "",
    published: row.published,
  };
}

function ReviewsList({
  reviews,
  onMutated,
}: {
  reviews: AdminReview[];
  onMutated: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function draftFor(row: AdminReview): ReviewDraft {
    return drafts[row.id] ?? toDraft(row);
  }

  function updateDraft(id: string, patch: Partial<ReviewDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? toDraft(reviews.find((r) => r.id === id)!)), ...patch } }));
  }

  async function saveRow(row: AdminReview) {
    const draft = drafts[row.id];
    if (!draft) return;
    setRowError((current) => ({ ...current, [row.id]: "" }));
    setRowBusy((current) => ({ ...current, [row.id]: true }));

    const wasPublished = row.published;
    const nowPublished = draft.published;
    const publishedAt = nowPublished
      ? (wasPublished ? row.published_at : new Date().toISOString())
      : null;

    const cleanedTranslations = Object.fromEntries(
      Object.entries(draft.comment_translations)
        .map(([locale, text]) => [locale, text?.trim() ?? ""])
        .filter(([, text]) => text),
    );

    const { error } = await getSupabaseBrowserClient()
      .from("reviews")
      .update({
        display_name: draft.display_name,
        rating: Number(draft.rating),
        comment: draft.comment,
        comment_translations: cleanedTranslations,
        source: draft.source.trim() || null,
        source_url: draft.source_url.trim() || null,
        stay_month: draft.stay_month ? `${draft.stay_month}-01` : null,
        published: nowPublished,
        published_at: publishedAt,
      })
      .eq("id", row.id);

    setRowBusy((current) => ({ ...current, [row.id]: false }));
    if (error) {
      setRowError((current) => ({ ...current, [row.id]: supabaseErrorMessage(error) }));
      return;
    }
    onMutated();
    setDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
  }

  async function deleteRow(id: string) {
    if (!confirm("Segur que voleu eliminar aquesta ressenya?")) return;
    const { error } = await getSupabaseBrowserClient().from("reviews").delete().eq("id", id);
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    onMutated();
  }

  return (
    <section className={styles.section}>
      <h2>Ressenyes existents</h2>
      <p className={styles.sectionHint}>
        Només les ressenyes &quot;Publicada&quot; es mostren al lloc web, ordenades per data de
        publicació.
      </p>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nom</th><th>Estrelles</th><th>Comentari</th><th>Font</th>
                <th>Mes d’estada</th><th>Publicada</th><th></th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((row) => {
                const draft = draftFor(row);
                return (
                  <tr key={row.id}>
                    <td><input value={draft.display_name} onChange={(e) => updateDraft(row.id, { display_name: e.target.value })} style={{ width: 120 }} /></td>
                    <td>
                      <select value={draft.rating} onChange={(e) => updateDraft(row.id, { rating: e.target.value })}>
                        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </td>
                    <td><textarea rows={2} style={{ width: 220 }} value={draft.comment} onChange={(e) => updateDraft(row.id, { comment: e.target.value })} /></td>
                    <td><input value={draft.source} onChange={(e) => updateDraft(row.id, { source: e.target.value })} placeholder="Google, Airbnb…" style={{ width: 100 }} /></td>
                    <td><input type="month" value={draft.stay_month} onChange={(e) => updateDraft(row.id, { stay_month: e.target.value })} /></td>
                    <td><input type="checkbox" checked={draft.published} onChange={(e) => updateDraft(row.id, { published: e.target.checked })} /></td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.secondaryButton} disabled={rowBusy[row.id]} onClick={() => saveRow(row)}>
                          {rowBusy[row.id] ? "Desant…" : "Desa"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Amaga traduccions" : "Traduccions"}
                        </button>
                        <button type="button" className={styles.dangerButton} onClick={() => deleteRow(row.id)}>Elimina</button>
                      </div>
                      {rowError[row.id] && <p className={styles.error} role="alert">{rowError[row.id]}</p>}
                    </td>
                  </tr>
                );
              })}
              {expandedId && reviews.some((row) => row.id === expandedId) && (
                <tr>
                  <td colSpan={7}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
                      <p className={styles.sectionHint}>
                        Opcional. Si deixeu un idioma en blanc, aquest idioma mostrarà el comentari
                        en català.
                      </p>
                      {TRANSLATABLE_LOCALES.map((locale) => (
                        <label key={locale}>{LOCALE_DISPLAY_NAMES[locale]}
                          <textarea
                            rows={2}
                            value={draftFor(reviews.find((r) => r.id === expandedId)!).comment_translations[locale] ?? ""}
                            onChange={(e) => updateDraft(expandedId, {
                              comment_translations: {
                                ...draftFor(reviews.find((r) => r.id === expandedId)!).comment_translations,
                                [locale]: e.target.value,
                              },
                            })}
                          />
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              {reviews.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--color-muted)" }}>Encara no hi ha cap ressenya.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AddReviewForm({ onAdded }: { onAdded: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [source, setSource] = useState("");
  const [stayMonth, setStayMonth] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim() || !comment.trim()) {
      setError("El nom i el comentari són obligatoris.");
      return;
    }
    setError("");
    setSaving(true);

    const { error: insertError } = await getSupabaseBrowserClient().from("reviews").insert({
      property_id: 1,
      display_name: displayName.trim(),
      rating: Number(rating),
      comment: comment.trim(),
      source: source.trim() || null,
      stay_month: stayMonth ? `${stayMonth}-01` : null,
      published,
      published_at: published ? new Date().toISOString() : null,
    });

    setSaving(false);
    if (insertError) {
      setError(supabaseErrorMessage(insertError));
      return;
    }
    setDisplayName("");
    setRating("5");
    setComment("");
    setSource("");
    setStayMonth("");
    setPublished(false);
    onAdded();
  }

  return (
    <section className={styles.section}>
      <h2>Afegeix una ressenya</h2>
      <div className={styles.card}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>Nom
              <input required maxLength={120} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label>Estrelles
              <select value={rating} onChange={(e) => setRating(e.target.value)}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>Font <span>(opcional)</span>
              <input maxLength={80} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Google, Airbnb…" />
            </label>
            <label>Mes d’estada <span>(opcional)</span>
              <input type="month" value={stayMonth} onChange={(e) => setStayMonth(e.target.value)} />
            </label>
          </div>
          <label>Comentari
            <textarea rows={4} required maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Publica-la ara mateix
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} type="submit" disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? "Afegint…" : "Afegeix la ressenya"}
          </button>
        </form>
      </div>
    </section>
  );
}
