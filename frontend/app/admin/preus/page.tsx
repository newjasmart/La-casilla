"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import useSWR from "swr";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { parseDateRange, toDateRange } from "@/lib/daterange";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AdminProperty, FeeRule, RatePeriod } from "@/types/admin";
import styles from "@/app/admin/admin.module.css";

export default function AdminPricingPage() {
  return (
    <RequireStaff>
      <AdminShell>
        <PricingPageContent />
      </AdminShell>
    </RequireStaff>
  );
}

interface PricingData {
  property: AdminProperty;
  ratePeriods: RatePeriod[];
  feeRules: FeeRule[];
}

async function fetchPricingData(): Promise<PricingData> {
  const supabase = getSupabaseBrowserClient();
  const [propertyResult, ratesResult, feesResult] = await Promise.all([
    supabase.from("properties").select("*").eq("id", 1).single(),
    // Explicit safety caps — see the identical comment in admin/ressenyes.
    supabase.from("rate_periods").select("*").eq("property_id", 1).order("priority", { ascending: false }).limit(500),
    supabase.from("fee_rules").select("*").eq("property_id", 1).order("sort_order", { ascending: true }).limit(500),
  ]);

  const firstError = propertyResult.error ?? ratesResult.error ?? feesResult.error;
  if (firstError) throw new Error(supabaseErrorMessage(firstError));

  return {
    property: propertyResult.data as AdminProperty,
    ratePeriods: (ratesResult.data ?? []) as RatePeriod[],
    feeRules: (feesResult.data ?? []) as FeeRule[],
  };
}

function PricingPageContent() {
  const { data, error, isLoading, mutate } = useSWR("admin-pricing", fetchPricingData);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Preus i tarifes</h1>
        <Link className={styles.backLink} href="/admin">← Tornar a la gestió</Link>
      </div>

      {isLoading && <p>Carregant…</p>}
      {error && <p className={styles.error} role="alert">{error instanceof Error ? error.message : "No s’han pogut carregar les dades."}</p>}

      {data && (
        <>
          <BasePricingSection property={data.property} onSaved={() => mutate()} />
          <RatePeriodsSection ratePeriods={data.ratePeriods} onMutated={() => mutate()} />
          <FeeRulesSection feeRules={data.feeRules} onMutated={() => mutate()} />
        </>
      )}
    </>
  );
}

function BasePricingSection({
  property,
  onSaved,
}: {
  property: AdminProperty;
  onSaved: () => void;
}) {
  const [basePrice, setBasePrice] = useState(String(property.base_nightly_price));
  const [minNights, setMinNights] = useState(String(property.base_minimum_nights));
  const [maxGuests, setMaxGuests] = useState(String(property.max_guests));
  const [maxInfants, setMaxInfants] = useState(String(property.max_infants));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const payload = {
      base_nightly_price: Number(basePrice),
      base_minimum_nights: Number(minNights),
      max_guests: Number(maxGuests),
      max_infants: Number(maxInfants),
    };

    const { error: updateError } = await getSupabaseBrowserClient()
      .from("properties")
      .update(payload)
      .eq("id", 1);

    setSaving(false);
    if (updateError) {
      setError(supabaseErrorMessage(updateError));
      return;
    }
    onSaved();
    setSaved(true);
  }

  return (
    <section className={styles.section}>
      <h2>Preu base i capacitat</h2>
      <p className={styles.sectionHint}>
        S’aplica a totes les nits que no estiguin cobertes per una temporada més avall.
      </p>
      <div className={styles.card}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fieldGrid}>
            <label>Preu per nit (€)
              <input type="number" min="0" step="0.01" required value={basePrice}
                onChange={(event) => setBasePrice(event.target.value)} />
            </label>
            <label>Estada mínima (nits)
              <input type="number" min="1" required value={minNights}
                onChange={(event) => setMinNights(event.target.value)} />
            </label>
            <label>Capacitat màxima (adults + infants)
              <input type="number" min="1" required value={maxGuests}
                onChange={(event) => setMaxGuests(event.target.value)} />
            </label>
            <label>Nadons màxims
              <input type="number" min="0" required value={maxInfants}
                onChange={(event) => setMaxInfants(event.target.value)} />
            </label>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {saved && !error && <p className={styles.success} role="status">Desat correctament.</p>}
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? "Desant…" : "Desa els canvis"}
          </button>
        </form>
      </div>
    </section>
  );
}

interface RatePeriodDraft {
  id: string;
  name: string;
  start: string;
  end: string;
  nightly_price: string;
  minimum_nights: string;
  priority: string;
  active: boolean;
}

function toDraft(row: RatePeriod): RatePeriodDraft {
  const range = parseDateRange(row.stay_period);
  return {
    id: row.id,
    name: row.name,
    start: range?.start ?? "",
    end: range?.end ?? "",
    nightly_price: String(row.nightly_price),
    minimum_nights: String(row.minimum_nights),
    priority: String(row.priority),
    active: row.active,
  };
}

function RatePeriodsSection({
  ratePeriods,
  onMutated,
}: {
  ratePeriods: RatePeriod[];
  onMutated: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, RatePeriodDraft>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
  const [newDraft, setNewDraft] = useState<Omit<RatePeriodDraft, "id">>({
    name: "", start: "", end: "", nightly_price: "", minimum_nights: "1", priority: "0", active: true,
  });
  const [newError, setNewError] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  function draftFor(row: RatePeriod): RatePeriodDraft {
    return drafts[row.id] ?? toDraft(row);
  }

  function updateDraft(id: string, patch: Partial<RatePeriodDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? toDraft(ratePeriods.find((r) => r.id === id)!)), ...patch } }));
  }

  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setRowError((current) => ({ ...current, [id]: "" }));
    setRowSaving((current) => ({ ...current, [id]: true }));

    const { error } = await getSupabaseBrowserClient()
      .from("rate_periods")
      .update({
        name: draft.name,
        stay_period: toDateRange(draft.start, draft.end),
        nightly_price: Number(draft.nightly_price),
        minimum_nights: Number(draft.minimum_nights),
        priority: Number(draft.priority),
        active: draft.active,
      })
      .eq("id", id);

    setRowSaving((current) => ({ ...current, [id]: false }));
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    onMutated();
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function deleteRow(id: string) {
    if (!confirm("Segur que voleu eliminar aquesta temporada de preus?")) return;
    const { error } = await getSupabaseBrowserClient().from("rate_periods").delete().eq("id", id);
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    onMutated();
  }

  async function addRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewError("");
    if (!newDraft.name || !newDraft.start || !newDraft.end || !newDraft.nightly_price) {
      setNewError("Ompliu el nom, les dates i el preu.");
      return;
    }
    setNewSaving(true);

    const { error } = await getSupabaseBrowserClient()
      .from("rate_periods")
      .insert({
        property_id: 1,
        name: newDraft.name,
        stay_period: toDateRange(newDraft.start, newDraft.end),
        nightly_price: Number(newDraft.nightly_price),
        minimum_nights: Number(newDraft.minimum_nights),
        priority: Number(newDraft.priority),
        active: newDraft.active,
      });

    setNewSaving(false);
    if (error) {
      setNewError(supabaseErrorMessage(error));
      return;
    }
    onMutated();
    setNewDraft({ name: "", start: "", end: "", nightly_price: "", minimum_nights: "1", priority: "0", active: true });
  }

  return (
    <section className={styles.section}>
      <h2>Temporades</h2>
      <p className={styles.sectionHint}>
        Un preu de temporada substitueix el preu base per a les nits dins del seu període.
        Si dues temporades actives se superposen amb la mateixa prioritat, la base de dades
        rebutjarà el canvi: doneu-los prioritats diferents en aquest cas.
      </p>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nom</th><th>Inici</th><th>Fi</th><th>Preu/nit</th>
                <th>Nits mín.</th><th>Prioritat</th><th>Activa</th><th></th>
              </tr>
            </thead>
            <tbody>
              {ratePeriods.map((row) => {
                const draft = draftFor(row);
                return (
                  <tr key={row.id}>
                    <td><input value={draft.name} onChange={(e) => updateDraft(row.id, { name: e.target.value })} /></td>
                    <td><input type="date" value={draft.start} onChange={(e) => updateDraft(row.id, { start: e.target.value })} /></td>
                    <td><input type="date" value={draft.end} onChange={(e) => updateDraft(row.id, { end: e.target.value })} /></td>
                    <td><input type="number" min="0" step="0.01" style={{ width: 90 }} value={draft.nightly_price} onChange={(e) => updateDraft(row.id, { nightly_price: e.target.value })} /></td>
                    <td><input type="number" min="1" style={{ width: 70 }} value={draft.minimum_nights} onChange={(e) => updateDraft(row.id, { minimum_nights: e.target.value })} /></td>
                    <td><input type="number" style={{ width: 70 }} value={draft.priority} onChange={(e) => updateDraft(row.id, { priority: e.target.value })} /></td>
                    <td><input type="checkbox" checked={draft.active} onChange={(e) => updateDraft(row.id, { active: e.target.checked })} /></td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.secondaryButton} disabled={rowSaving[row.id]} onClick={() => saveRow(row.id)}>
                          {rowSaving[row.id] ? "Desant…" : "Desa"}
                        </button>
                        <button type="button" className={styles.dangerButton} onClick={() => deleteRow(row.id)}>Elimina</button>
                      </div>
                      {rowError[row.id] && <p className={styles.error} role="alert">{rowError[row.id]}</p>}
                    </td>
                  </tr>
                );
              })}
              {ratePeriods.length === 0 && (
                <tr><td colSpan={8} style={{ color: "var(--color-muted)" }}>Encara no hi ha cap temporada.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <form className={styles.form} onSubmit={addRow} style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: "1rem" }}>Afegeix una temporada</h3>
          <div className={styles.fieldGrid}>
            <label>Nom
              <input value={newDraft.name} onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })} />
            </label>
            <label>Inici
              <input type="date" value={newDraft.start} onChange={(e) => setNewDraft({ ...newDraft, start: e.target.value })} />
            </label>
            <label>Fi (exclòs)
              <input type="date" value={newDraft.end} onChange={(e) => setNewDraft({ ...newDraft, end: e.target.value })} />
            </label>
            <label>Preu per nit (€)
              <input type="number" min="0" step="0.01" value={newDraft.nightly_price} onChange={(e) => setNewDraft({ ...newDraft, nightly_price: e.target.value })} />
            </label>
            <label>Estada mínima
              <input type="number" min="1" value={newDraft.minimum_nights} onChange={(e) => setNewDraft({ ...newDraft, minimum_nights: e.target.value })} />
            </label>
            <label>Prioritat
              <input type="number" value={newDraft.priority} onChange={(e) => setNewDraft({ ...newDraft, priority: e.target.value })} />
            </label>
          </div>
          {newError && <p className={styles.error} role="alert">{newError}</p>}
          <button className={styles.primaryButton} type="submit" disabled={newSaving} style={{ alignSelf: "flex-start" }}>
            {newSaving ? "Afegint…" : "Afegeix la temporada"}
          </button>
        </form>
      </div>
    </section>
  );
}

interface FeeRuleDraft {
  code: string;
  label: string;
  calculation: "per_stay" | "per_night";
  amount: string;
  validStart: string;
  validEnd: string;
  active: boolean;
  sortOrder: string;
}

function toFeeDraft(row: FeeRule): FeeRuleDraft {
  const range = row.valid_period ? parseDateRange(row.valid_period) : null;
  return {
    code: row.code,
    label: row.label,
    calculation: row.calculation,
    amount: String(row.amount),
    validStart: range?.start ?? "",
    validEnd: range?.end ?? "",
    active: row.active,
    sortOrder: String(row.sort_order),
  };
}

function FeeRulesSection({
  feeRules,
  onMutated,
}: {
  feeRules: FeeRule[];
  onMutated: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, FeeRuleDraft>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
  const [newDraft, setNewDraft] = useState<FeeRuleDraft>({
    code: "", label: "", calculation: "per_stay", amount: "", validStart: "", validEnd: "", active: true, sortOrder: "0",
  });
  const [newError, setNewError] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  function draftFor(row: FeeRule): FeeRuleDraft {
    return drafts[row.id] ?? toFeeDraft(row);
  }

  function updateDraft(id: string, patch: Partial<FeeRuleDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? toFeeDraft(feeRules.find((r) => r.id === id)!)), ...patch } }));
  }

  function validPeriodFrom(start: string, end: string): string | null | "invalid" {
    if (!start && !end) return null;
    if (!start || !end) return "invalid";
    return toDateRange(start, end);
  }

  async function saveRow(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    const validPeriod = validPeriodFrom(draft.validStart, draft.validEnd);
    if (validPeriod === "invalid") {
      setRowError((current) => ({ ...current, [id]: "Indiqueu inici i fi, o cap dels dos." }));
      return;
    }
    setRowError((current) => ({ ...current, [id]: "" }));
    setRowSaving((current) => ({ ...current, [id]: true }));

    const { error } = await getSupabaseBrowserClient()
      .from("fee_rules")
      .update({
        code: draft.code,
        label: draft.label,
        calculation: draft.calculation,
        amount: Number(draft.amount),
        valid_period: validPeriod,
        active: draft.active,
        sort_order: Number(draft.sortOrder),
      })
      .eq("id", id);

    setRowSaving((current) => ({ ...current, [id]: false }));
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    onMutated();
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function deleteRow(id: string) {
    if (!confirm("Segur que voleu eliminar aquest suplement?")) return;
    const { error } = await getSupabaseBrowserClient().from("fee_rules").delete().eq("id", id);
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    onMutated();
  }

  async function addRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validPeriod = validPeriodFrom(newDraft.validStart, newDraft.validEnd);
    if (validPeriod === "invalid") {
      setNewError("Indiqueu inici i fi, o cap dels dos.");
      return;
    }
    if (!newDraft.code || !newDraft.label || !newDraft.amount) {
      setNewError("Ompliu el codi, l’etiqueta i l’import.");
      return;
    }
    setNewError("");
    setNewSaving(true);

    const { error } = await getSupabaseBrowserClient()
      .from("fee_rules")
      .insert({
        property_id: 1,
        code: newDraft.code,
        label: newDraft.label,
        calculation: newDraft.calculation,
        amount: Number(newDraft.amount),
        valid_period: validPeriod,
        active: newDraft.active,
        sort_order: Number(newDraft.sortOrder),
      });

    setNewSaving(false);
    if (error) {
      setNewError(supabaseErrorMessage(error));
      return;
    }
    onMutated();
    setNewDraft({ code: "", label: "", calculation: "per_stay", amount: "", validStart: "", validEnd: "", active: true, sortOrder: "0" });
  }

  return (
    <section className={styles.section}>
      <h2>Suplements</h2>
      <p className={styles.sectionHint}>
        Per exemple neteja, animals o llits addicionals. &quot;Per estada&quot; es cobra un cop;
        &quot;per nit&quot; es multiplica per les nits de l’estada (o per les nits dins del
        període de validesa, si n’hi ha un).
      </p>
      <div className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Codi</th><th>Etiqueta</th><th>Càlcul</th><th>Import</th>
                <th>Vàlid des de</th><th>Vàlid fins a</th><th>Actiu</th><th></th>
              </tr>
            </thead>
            <tbody>
              {feeRules.map((row) => {
                const draft = draftFor(row);
                return (
                  <tr key={row.id}>
                    <td><input value={draft.code} onChange={(e) => updateDraft(row.id, { code: e.target.value })} style={{ width: 100 }} /></td>
                    <td><input value={draft.label} onChange={(e) => updateDraft(row.id, { label: e.target.value })} /></td>
                    <td>
                      <select value={draft.calculation} onChange={(e) => updateDraft(row.id, { calculation: e.target.value as "per_stay" | "per_night" })}>
                        <option value="per_stay">Per estada</option>
                        <option value="per_night">Per nit</option>
                      </select>
                    </td>
                    <td><input type="number" min="0" step="0.01" style={{ width: 90 }} value={draft.amount} onChange={(e) => updateDraft(row.id, { amount: e.target.value })} /></td>
                    <td><input type="date" value={draft.validStart} onChange={(e) => updateDraft(row.id, { validStart: e.target.value })} /></td>
                    <td><input type="date" value={draft.validEnd} onChange={(e) => updateDraft(row.id, { validEnd: e.target.value })} /></td>
                    <td><input type="checkbox" checked={draft.active} onChange={(e) => updateDraft(row.id, { active: e.target.checked })} /></td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.secondaryButton} disabled={rowSaving[row.id]} onClick={() => saveRow(row.id)}>
                          {rowSaving[row.id] ? "Desant…" : "Desa"}
                        </button>
                        <button type="button" className={styles.dangerButton} onClick={() => deleteRow(row.id)}>Elimina</button>
                      </div>
                      {rowError[row.id] && <p className={styles.error} role="alert">{rowError[row.id]}</p>}
                    </td>
                  </tr>
                );
              })}
              {feeRules.length === 0 && (
                <tr><td colSpan={8} style={{ color: "var(--color-muted)" }}>Encara no hi ha cap suplement.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <form className={styles.form} onSubmit={addRow} style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: "1rem" }}>Afegeix un suplement</h3>
          <div className={styles.fieldGrid}>
            <label>Codi
              <input value={newDraft.code} onChange={(e) => setNewDraft({ ...newDraft, code: e.target.value })} placeholder="neteja" />
            </label>
            <label>Etiqueta
              <input value={newDraft.label} onChange={(e) => setNewDraft({ ...newDraft, label: e.target.value })} placeholder="Neteja final" />
            </label>
            <label>Càlcul
              <select value={newDraft.calculation} onChange={(e) => setNewDraft({ ...newDraft, calculation: e.target.value as "per_stay" | "per_night" })}>
                <option value="per_stay">Per estada</option>
                <option value="per_night">Per nit</option>
              </select>
            </label>
            <label>Import (€)
              <input type="number" min="0" step="0.01" value={newDraft.amount} onChange={(e) => setNewDraft({ ...newDraft, amount: e.target.value })} />
            </label>
            <label>Vàlid des de <span>(opcional)</span>
              <input type="date" value={newDraft.validStart} onChange={(e) => setNewDraft({ ...newDraft, validStart: e.target.value })} />
            </label>
            <label>Vàlid fins a <span>(opcional)</span>
              <input type="date" value={newDraft.validEnd} onChange={(e) => setNewDraft({ ...newDraft, validEnd: e.target.value })} />
            </label>
          </div>
          {newError && <p className={styles.error} role="alert">{newError}</p>}
          <button className={styles.primaryButton} type="submit" disabled={newSaving} style={{ alignSelf: "flex-start" }}>
            {newSaving ? "Afegint…" : "Afegeix el suplement"}
          </button>
        </form>
      </div>
    </section>
  );
}
