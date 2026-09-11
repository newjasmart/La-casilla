import { useState } from "react";
import { supabaseErrorMessage } from "@/lib/admin-errors";

/**
 * Shared by every admin "editable table" (rate periods, fee rules, media,
 * reviews): a per-row draft, a busy flag, and an error message, with
 * save/delete lifecycles that clear busy/error state consistently. Each
 * table still supplies its own field shape and its own Supabase call — this
 * only owns the bookkeeping around that call, which was previously
 * hand-rolled identically four times.
 */
export function useEditableRows<Row extends { id: string }, Draft>(
  rows: Row[],
  toDraft: (row: Row) => Draft,
) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  function draftFor(row: Row): Draft {
    return drafts[row.id] ?? toDraft(row);
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const row = rows.find((r) => r.id === id);
      const base = current[id] ?? (row ? toDraft(row) : undefined);
      if (!base) return current;
      return { ...current, [id]: { ...base, ...patch } };
    });
  }

  function clearDraft(id: string) {
    setDrafts((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function setError(id: string, message: string) {
    setRowError((current) => ({ ...current, [id]: message }));
  }

  /**
   * Runs `mutate(draft)` for the row's current draft, clearing the draft on
   * success. Returns whether it succeeded. Takes a `PromiseLike` rather than
   * `Promise` because the Supabase query builder is thenable but isn't a
   * real Promise instance (no .catch/.finally) — `await` works on either.
   */
  async function save(
    id: string,
    mutate: (draft: Draft) => PromiseLike<{ error: unknown }>,
  ): Promise<boolean> {
    const draft = drafts[id];
    if (!draft) return false;
    setError(id, "");
    setRowBusy((current) => ({ ...current, [id]: true }));
    const { error } = await mutate(draft);
    setRowBusy((current) => ({ ...current, [id]: false }));
    if (error) {
      setError(id, supabaseErrorMessage(error));
      return false;
    }
    clearDraft(id);
    return true;
  }

  /** Confirms, then runs `mutate()`. Returns whether it succeeded (false if the user cancelled the confirm). */
  async function remove(
    id: string,
    confirmMessage: string,
    mutate: () => PromiseLike<{ error: unknown }>,
  ): Promise<boolean> {
    if (!confirm(confirmMessage)) return false;
    setRowBusy((current) => ({ ...current, [id]: true }));
    const { error } = await mutate();
    setRowBusy((current) => ({ ...current, [id]: false }));
    if (error) {
      setError(id, supabaseErrorMessage(error));
      return false;
    }
    return true;
  }

  return { draftFor, updateDraft, clearDraft, save, remove, rowError, rowBusy, setError };
}
