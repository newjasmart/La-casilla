"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import useSWR from "swr";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AdminReview } from "@/types/admin";
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
    .order("created_at", { ascending: false });
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

    const { error } = await getSupabaseBrowserClient()
      .from("reviews")
      .update({
        display_name: draft.display_name,
        rating: Number(draft.rating),
        comment: draft.comment,
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
                        <button type="button" className={styles.dangerButton} onClick={() => deleteRow(row.id)}>Elimina</button>
                      </div>
                      {rowError[row.id] && <p className={styles.error} role="alert">{rowError[row.id]}</p>}
                    </td>
                  </tr>
                );
              })}
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
