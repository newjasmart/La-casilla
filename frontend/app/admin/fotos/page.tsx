"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import useSWR from "swr";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { publicMediaUrl } from "@/lib/media";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useEditableRows } from "@/lib/use-editable-rows";
import type { AdminPropertyMedia, MediaCategory } from "@/types/admin";
import styles from "@/app/admin/admin.module.css";

const CATEGORIES: { value: MediaCategory; label: string }[] = [
  { value: "exterior", label: "Exterior" },
  { value: "interior", label: "Interior" },
  { value: "amenities", label: "Equipaments" },
  { value: "surroundings", label: "Entorn" },
];

export default function AdminMediaPage() {
  return (
    <RequireStaff>
      <AdminShell>
        <MediaPageContent />
      </AdminShell>
    </RequireStaff>
  );
}

async function fetchMedia(): Promise<AdminPropertyMedia[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("property_media")
    .select("*")
    .eq("property_id", 1)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    // Explicit safety cap — see the identical comment in admin/ressenyes.
    .limit(500);
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as AdminPropertyMedia[];
}

function MediaPageContent() {
  const { data, error, isLoading, mutate } = useSWR("admin-media", fetchMedia);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Fotos</h1>
        <Link className={styles.backLink} href="/admin">← Tornar a la gestió</Link>
      </div>

      {isLoading && <p>Carregant…</p>}
      {error && <p className={styles.error} role="alert">{error instanceof Error ? error.message : "No s’han pogut carregar les fotos."}</p>}

      {data && (
        <>
          <MediaList media={data} onMutated={() => mutate()} />
          <UploadForm onUploaded={() => mutate()} />
        </>
      )}
    </>
  );
}

interface MediaDraft {
  category: MediaCategory;
  alt_text: string;
  caption: string;
  sort_order: string;
  published: boolean;
}

function toDraft(row: AdminPropertyMedia): MediaDraft {
  return {
    category: row.category,
    alt_text: row.alt_text,
    caption: row.caption ?? "",
    sort_order: String(row.sort_order),
    published: row.published,
  };
}

function MediaList({
  media,
  onMutated,
}: {
  media: AdminPropertyMedia[];
  onMutated: () => void;
}) {
  const { draftFor, updateDraft, rowError, rowBusy, save, remove } = useEditableRows(media, toDraft);

  async function saveRow(id: string) {
    const ok = await save(id, (draft) => getSupabaseBrowserClient()
      .from("property_media")
      .update({
        category: draft.category,
        alt_text: draft.alt_text,
        caption: draft.caption.trim() || null,
        sort_order: Number(draft.sort_order),
        published: draft.published,
      })
      .eq("id", id));
    if (ok) onMutated();
  }

  async function deleteRow(row: AdminPropertyMedia) {
    const ok = await remove(row.id, "Segur que voleu eliminar aquesta foto? També s’esborrarà l’arxiu.", async () => {
      const supabase = getSupabaseBrowserClient();
      await supabase.storage.from("property-media").remove([row.storage_path]);
      return supabase.from("property_media").delete().eq("id", row.id);
    });
    if (ok) onMutated();
  }

  return (
    <section className={styles.section}>
      <h2>Fotos actuals</h2>
      <p className={styles.sectionHint}>
        Només les fotos &quot;Publicades&quot; apareixen a la galeria pública, ordenades per
        categoria i posició.
      </p>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Previsualització</th><th>Categoria</th><th>Text alternatiu</th>
                <th>Llegenda</th><th>Posició</th><th>Publicada</th><th></th>
              </tr>
            </thead>
            <tbody>
              {media.map((row) => {
                const draft = draftFor(row);
                return (
                  <tr key={row.id}>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail, no Image domain configured for Supabase storage */}
                      <img src={publicMediaUrl(row.storage_path)} alt="" width={72} height={54} style={{ objectFit: "cover", borderRadius: 8 }} />
                    </td>
                    <td>
                      <select value={draft.category} onChange={(e) => updateDraft(row.id, { category: e.target.value as MediaCategory })}>
                        {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </td>
                    <td><input value={draft.alt_text} onChange={(e) => updateDraft(row.id, { alt_text: e.target.value })} /></td>
                    <td><input value={draft.caption} onChange={(e) => updateDraft(row.id, { caption: e.target.value })} /></td>
                    <td><input type="number" style={{ width: 60 }} value={draft.sort_order} onChange={(e) => updateDraft(row.id, { sort_order: e.target.value })} /></td>
                    <td><input type="checkbox" checked={draft.published} onChange={(e) => updateDraft(row.id, { published: e.target.checked })} /></td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.secondaryButton} disabled={rowBusy[row.id]} onClick={() => saveRow(row.id)}>
                          {rowBusy[row.id] ? "Desant…" : "Desa"}
                        </button>
                        <button type="button" className={styles.dangerButton} disabled={rowBusy[row.id]} onClick={() => deleteRow(row)}>Elimina</button>
                      </div>
                      {rowError[row.id] && <p className={styles.error} role="alert">{rowError[row.id]}</p>}
                    </td>
                  </tr>
                );
              })}
              {media.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--color-muted)" }}>Encara no hi ha cap foto.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<MediaCategory>("interior");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Trieu un arxiu d’imatge.");
      return;
    }
    if (!altText.trim()) {
      setError("El text alternatiu és obligatori (accessibilitat i SEO).");
      return;
    }
    setError("");
    setUploading(true);

    const supabase = getSupabaseBrowserClient();
    const extension = file.name.split(".").pop()?.toLowerCase() || "webp";
    const path = `property-1/${category}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("property-media")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { error: insertError } = await supabase.from("property_media").insert({
      property_id: 1,
      storage_path: path,
      category,
      alt_text: altText.trim(),
      caption: caption.trim() || null,
      sort_order: 0,
      published: false,
    });

    setUploading(false);
    if (insertError) {
      await supabase.storage.from("property-media").remove([path]);
      setError(supabaseErrorMessage(insertError));
      return;
    }

    setFile(null);
    setAltText("");
    setCaption("");
    onUploaded();
  }

  return (
    <section className={styles.section}>
      <h2>Puja una foto nova</h2>
      <p className={styles.sectionHint}>
        Es puja sense publicar: activeu &quot;Publicada&quot; a la llista de sobre quan estigui
        a punt.
      </p>
      <div className={styles.card}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>Arxiu
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>Categoria
              <select value={category} onChange={(e) => setCategory(e.target.value as MediaCategory)}>
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>Text alternatiu
              <input required maxLength={300} value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Descripció breu de la imatge" />
            </label>
            <label>Llegenda <span>(opcional)</span>
              <input maxLength={1000} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primaryButton} type="submit" disabled={uploading} style={{ alignSelf: "flex-start" }}>
            {uploading ? "Pujant…" : "Puja la foto"}
          </button>
        </form>
      </div>
    </section>
  );
}
