"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useEditableRows } from "@/lib/use-editable-rows";
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

      {data && <ReviewsList reviews={data} onMutated={() => mutate()} />}
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
  const { draftFor, updateDraft, rowError, rowBusy, save, remove } = useEditableRows(reviews, toDraft);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function saveRow(row: AdminReview) {
    const ok = await save(row.id, (draft) => {
      const publishedAt = draft.published
        ? (row.published ? row.published_at : new Date().toISOString())
        : null;
      const cleanedTranslations = Object.fromEntries(
        Object.entries(draft.comment_translations)
          .map(([locale, text]) => [locale, text?.trim() ?? ""])
          .filter(([, text]) => text),
      );

      return getSupabaseBrowserClient()
        .from("reviews")
        .update({
          display_name: draft.display_name,
          rating: Number(draft.rating),
          comment: draft.comment,
          comment_translations: cleanedTranslations,
          source: draft.source.trim() || null,
          source_url: draft.source_url.trim() || null,
          stay_month: draft.stay_month ? `${draft.stay_month}-01` : null,
          published: draft.published,
          published_at: publishedAt,
        })
        .eq("id", row.id);
    });
    if (ok) onMutated();
  }

  async function deleteRow(id: string) {
    const ok = await remove(id, "Segur que voleu eliminar aquesta ressenya?", () => getSupabaseBrowserClient()
      .from("reviews").delete().eq("id", id));
    if (ok) onMutated();
  }

  return (
    <section className={styles.section}>
      <h2>Ressenyes</h2>
      <p className={styles.sectionHint}>
        Aquestes ressenyes provenen dels vostres hostes reals (carregades directament a la base
        de dades). Des d&apos;aquí podeu publicar-les, traduir-les, corregir-hi una errada o
        eliminar les que no vulgueu mostrar — <strong>no es poden crear ressenyes noves des
        d&apos;aquest tauler</strong>, per evitar testimonis falsos. Només les &quot;Publicada&quot;
        es mostren al lloc web, ordenades per data de publicació.
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
