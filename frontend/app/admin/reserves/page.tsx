"use client";

import Link from "next/link";
import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import { AdminShell } from "@/components/admin/admin-shell";
import { RequireStaff } from "@/components/admin/require-staff";
import { supabaseErrorMessage } from "@/lib/admin-errors";
import { formatMoney } from "@/lib/intl-format";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { AdminReservation, ReservationStatus } from "@/types/admin";
import styles from "@/app/admin/admin.module.css";

const STATUS_LABELS: Record<ReservationStatus, string> = {
  requested: "Sol·licitada",
  payment_pending: "Pagament pendent",
  confirmed: "Confirmada",
  cancelled: "Cancel·lada",
  expired: "Expirada",
};

const STATUS_BADGE: Record<ReservationStatus, string> = {
  requested: "badgeRequested",
  payment_pending: "badgePending",
  confirmed: "badgeConfirmed",
  cancelled: "badgeCancelled",
  expired: "badgeExpired",
};

const FILTERS: { value: ReservationStatus | "all"; label: string }[] = [
  { value: "requested", label: "Sol·licitades" },
  { value: "confirmed", label: "Confirmades" },
  { value: "cancelled", label: "Cancel·lades" },
  { value: "expired", label: "Expirades" },
  { value: "all", label: "Totes" },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ca-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default function AdminReservationsPage() {
  return (
    <RequireStaff>
      <AdminShell>
        <ReservationsContent />
      </AdminShell>
    </RequireStaff>
  );
}

const PAGE_SIZE = 50;

async function fetchReservationsPage(
  status: ReservationStatus | "all",
  pageIndex: number,
): Promise<AdminReservation[]> {
  let query = getSupabaseBrowserClient()
    .from("reservations")
    .select("*")
    .order("requested_at", { ascending: false })
    .range(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE - 1);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []) as AdminReservation[];
}

function ReservationsContent() {
  const [filter, setFilter] = useState<ReservationStatus | "all">("requested");
  const {
    data: pages, error: loadError, isLoading, isValidating, mutate, size, setSize,
  } = useSWRInfinite(
    (pageIndex) => ["admin-reservations", filter, pageIndex] as const,
    ([, status, pageIndex]) => fetchReservationsPage(status, pageIndex),
  );
  const rows = pages?.flat() ?? [];
  const lastPage = pages?.at(-1);
  const hasMore = lastPage !== undefined && lastPage.length === PAGE_SIZE;
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  async function confirmReservation(id: string) {
    setRowError((current) => ({ ...current, [id]: "" }));
    setRowBusy((current) => ({ ...current, [id]: true }));
    const { error } = await getSupabaseBrowserClient()
      .from("reservations")
      .update({ status: "confirmed" })
      .eq("id", id);
    setRowBusy((current) => ({ ...current, [id]: false }));
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    mutate();
  }

  async function cancelReservation(id: string) {
    const reason = prompt("Motiu de la cancel·lació (obligatori, mínim 3 caràcters):");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setRowError((current) => ({ ...current, [id]: "Cal un motiu d’almenys 3 caràcters." }));
      return;
    }
    setRowError((current) => ({ ...current, [id]: "" }));
    setRowBusy((current) => ({ ...current, [id]: true }));
    const { error } = await getSupabaseBrowserClient()
      .from("reservations")
      .update({ status: "cancelled", cancellation_reason: reason.trim() })
      .eq("id", id);
    setRowBusy((current) => ({ ...current, [id]: false }));
    if (error) {
      setRowError((current) => ({ ...current, [id]: supabaseErrorMessage(error) }));
      return;
    }
    mutate();
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Reserves</h1>
        <Link className={styles.backLink} href="/admin">← Tornar a la gestió</Link>
      </div>

      <div className={styles.rowActions} style={{ marginTop: 20 }}>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={item.value === filter ? styles.primaryButton : styles.secondaryButton}
            onClick={() => { setFilter(item.value); setSize(1); }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.card} style={{ marginTop: 20 }}>
        {isLoading && <p>Carregant…</p>}
        {loadError && <p className={styles.error} role="alert">{loadError instanceof Error ? loadError.message : "No s’han pogut carregar les reserves."}</p>}
        {!isLoading && !loadError && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Referència</th><th>Client</th><th>Arribada</th><th>Sortida</th>
                  <th>Hostes</th><th>Total</th><th>Estat</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.public_reference}</td>
                    <td>
                      {row.first_name} {row.last_name}
                      <br /><a href={`mailto:${row.email}`} style={{ color: "var(--color-muted)" }}>{row.email}</a>
                      {row.phone && <><br /><span style={{ color: "var(--color-muted)" }}>{row.phone}</span></>}
                    </td>
                    <td>{formatDate(row.arrival_date)}</td>
                    <td>{formatDate(row.departure_date)}</td>
                    <td>{row.adults + row.children} {row.infants > 0 ? `+ ${row.infants} nadó(ns)` : ""}</td>
                    <td>{formatMoney(row.total_amount, row.currency, "ca")}</td>
                    <td><span className={`${styles.badge} ${styles[STATUS_BADGE[row.status]]}`}>{STATUS_LABELS[row.status]}</span></td>
                    <td>
                      {(row.status === "requested" || row.status === "payment_pending") && (
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.secondaryButton} disabled={rowBusy[row.id]} onClick={() => confirmReservation(row.id)}>
                            Confirma
                          </button>
                          <button type="button" className={styles.dangerButton} disabled={rowBusy[row.id]} onClick={() => cancelReservation(row.id)}>
                            Cancel·la
                          </button>
                        </div>
                      )}
                      {row.status === "confirmed" && (
                        <button type="button" className={styles.dangerButton} disabled={rowBusy[row.id]} onClick={() => cancelReservation(row.id)}>
                          Cancel·la
                        </button>
                      )}
                      {rowError[row.id] && <p className={styles.error} role="alert">{rowError[row.id]}</p>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={8} style={{ color: "var(--color-muted)" }}>Cap reserva en aquest estat.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={isValidating}
              onClick={() => setSize(size + 1)}
            >
              {isValidating ? "Carregant…" : `Carrega'n ${PAGE_SIZE} més`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
