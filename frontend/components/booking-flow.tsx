"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  createReservationKey,
  getStayQuote,
  sendReservationRequest,
  type ReservationResponse,
  type StayQuote,
} from "@/lib/booking";
import styles from "./booking-flow.module.css";

interface BookingFlowProps {
  minimumAdvanceDays?: number;
  bookingHorizonDays?: number;
  maxGuests?: number;
  maxInfants?: number;
}

interface Selection {
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  infants: number;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("ca-ES", { style: "currency", currency }).format(value);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function selectionError(selection: Selection, maxGuests?: number, maxInfants?: number): string | null {
  if (!validDate(selection.arrival) || !validDate(selection.departure)) {
    return "Seleccioneu unes dates vàlides d’arribada i sortida.";
  }
  if (selection.departure <= selection.arrival) {
    return "La data de sortida ha de ser posterior a la d’arribada.";
  }
  if (!Number.isSafeInteger(selection.adults) || selection.adults < 1
      || !Number.isSafeInteger(selection.children) || selection.children < 0
      || !Number.isSafeInteger(selection.infants) || selection.infants < 0) {
    return "Introduïu un nombre d’hostes vàlid.";
  }
  if (maxGuests !== undefined && selection.adults + selection.children > maxGuests) {
    return `La casa té una capacitat màxima de ${maxGuests} persones, sense comptar els nadons.`;
  }
  if (maxInfants !== undefined && selection.infants > maxInfants) {
    return `La casa admet un màxim de ${maxInfants} nadons.`;
  }
  return null;
}

function quoteError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("MINIMUM_NIGHTS_NOT_MET")) return "L’estada no arriba al mínim de nits requerit per a aquestes dates.";
  if (message.includes("CAPACITY_EXCEEDED")) return "El nombre d’hostes supera la capacitat de la casa.";
  if (message.includes("STAY_OUTSIDE_BOOKING_WINDOW")) return "Aquestes dates queden fora del període disponible per reservar.";
  if (message.includes("INVALID_STAY_DATES")) return "Reviseu les dates d’arribada i sortida.";
  return "No hem pogut consultar aquestes dates. Torneu-ho a provar d’aquí a uns instants.";
}

export function BookingFlow({
  minimumAdvanceDays = 1,
  bookingHorizonDays = 730,
  maxGuests,
  maxInfants,
}: BookingFlowProps) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }, []);
  const earliest = isoDate(addDays(today, minimumAdvanceDays));
  const latest = isoDate(addDays(today, bookingHorizonDays));
  const knownCapacity = typeof maxGuests === "number";
  const adultsMax = maxGuests ?? 100;
  const childrenMax = maxGuests ?? 100;
  const infantsMax = maxInfants ?? 100;
  const [selection, setSelection] = useState<Selection>({
    arrival: "",
    departure: "",
    adults: 2,
    children: 0,
    infants: 0,
  });
  const [quote, setQuote] = useState<StayQuote | null>(null);
  const [quoteMessage, setQuoteMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [reservation, setReservation] = useState<ReservationResponse | null>(null);
  const [reservationError, setReservationError] = useState("");
  const [reservationKey, setReservationKey] = useState<string | null>(null);

  function updateSelection<K extends keyof Selection>(key: K, value: Selection[K]) {
    setSelection((current) => ({ ...current, [key]: value }));
    setQuote(null);
    setQuoteMessage("");
    setReservation(null);
    setReservationError("");
    setReservationKey(null);
  }

  async function checkAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = selectionError(selection, maxGuests, maxInfants);
    if (validationError) {
      setQuoteMessage(validationError);
      return;
    }

    setChecking(true);
    setQuote(null);
    setQuoteMessage("");
    setReservation(null);
    setReservationError("");

    try {
      const result = await getStayQuote(selection);
      setQuote(result);
      if (!result.available) setQuoteMessage("La casa no està disponible durant aquestes dates.");
    } catch (error) {
      setQuoteMessage(quoteError(error));
    } finally {
      setChecking(false);
    }
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote?.available) return;
    const form = new FormData(event.currentTarget);
    setSending(true);
    setReservation(null);
    setReservationError("");

    try {
      const key = reservationKey ?? createReservationKey();
      setReservationKey(key);
      const result = await sendReservationRequest({
        ...selection,
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        message: String(form.get("message") ?? ""),
        privacyAccepted: form.get("privacyAccepted") === "on",
        website: String(form.get("website") ?? ""),
      }, key);
      setReservation(result);
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "No s’ha pogut enviar la sol·licitud.");
    } finally {
      setSending(false);
    }
  }

  if (reservation?.ok) {
    return (
      <section className={styles.booking} id="reserva" aria-labelledby="booking-title">
        <div className={styles.success} role="status">
          <p className={styles.kicker}>Sol·licitud enviada</p>
          <h2 id="booking-title">Gràcies! Ja tenim la vostra petició.</h2>
          {reservation.reference && <p>Referència: <strong>{reservation.reference}</strong></p>}
          <p>Us contactarem per confirmar la disponibilitat i els passos següents.</p>
          {reservation.warning && <p>{reservation.warning}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.booking} id="reserva" aria-labelledby="booking-title">
      <div className={styles.intro}>
        <p className={styles.kicker}>Reserveu la casa sencera</p>
        <h2 id="booking-title">Comproveu les dates per al vostre grup.</h2>
        <p>
          La Casilla és només per a vosaltres: família, amistats o grup ciclista. Consulteu
          la disponibilitat i el preu real abans d’enviar la sol·licitud.
        </p>
      </div>

      <div className={styles.panel}>
        <form className={styles.selectionForm} onSubmit={checkAvailability}>
          <div className={styles.fieldGrid}>
            <label>
              Arribada
              <input
                type="date"
                required
                min={earliest}
                max={latest}
                value={selection.arrival}
                onChange={(event) => updateSelection("arrival", event.target.value)}
              />
            </label>
            <label>
              Sortida
              <input
                type="date"
                required
                min={selection.arrival || earliest}
                max={latest}
                value={selection.departure}
                onChange={(event) => updateSelection("departure", event.target.value)}
              />
            </label>
            <label>
              Adults
              <input
                type="number"
                required
                min={1}
                max={adultsMax}
                value={selection.adults}
                onChange={(event) => updateSelection("adults", Number(event.target.value))}
              />
            </label>
            <label>
              Infants
              <input
                type="number"
                min={0}
                max={childrenMax}
                value={selection.children}
                onChange={(event) => updateSelection("children", Number(event.target.value))}
              />
            </label>
            <label>
              Nadons
              <input
                type="number"
                min={0}
                max={infantsMax}
                value={selection.infants}
                onChange={(event) => updateSelection("infants", Number(event.target.value))}
              />
            </label>
          </div>
          {knownCapacity && <p className={styles.hint}>Capacitat màxima: {adultsMax} persones, sense comptar fins a {maxInfants ?? 0} nadons.</p>}
          <button className={styles.primaryButton} type="submit" disabled={checking}>
            {checking ? "Consultant…" : "Consulta disponibilitat"}
          </button>
        </form>

        {quoteMessage && <p className={styles.error} role="alert">{quoteMessage}</p>}

        {quote?.available && (
          <div className={styles.quote} role="status">
            <div>
              <p className={styles.available}>Disponible</p>
              <strong>{quote.nights} {quote.nights === 1 ? "nit" : "nits"}</strong>
            </div>
            <dl>
              <div><dt>Allotjament</dt><dd>{formatMoney(quote.nightly_subtotal, quote.currency)}</dd></div>
              {quote.fees_total > 0 && <div><dt>Serveis i suplements</dt><dd>{formatMoney(quote.fees_total, quote.currency)}</dd></div>}
              <div className={styles.total}><dt>Total</dt><dd>{formatMoney(quote.total_amount, quote.currency)}</dd></div>
            </dl>
          </div>
        )}

        {quote?.available && (
          <form className={styles.guestForm} onSubmit={submitReservation}>
            <h3>Envieu la sol·licitud de reserva</h3>
            <p>Les dates quedaran pendents de confirmació després d’enviar el formulari.</p>
            <div className={styles.contactGrid}>
              <label>Nom<input name="firstName" required minLength={1} maxLength={120} autoComplete="given-name" /></label>
              <label>Cognoms<input name="lastName" required minLength={1} maxLength={160} autoComplete="family-name" /></label>
              <label>Correu electrònic<input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
              <label>Telèfon <span>(opcional)</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
            </div>
            <label>Expliqueu-nos alguna cosa sobre el grup <span>(opcional)</span>
              <textarea name="message" maxLength={5000} rows={4} placeholder="Per exemple, si veniu a pedalar o necessiteu espai per a les bicicletes." />
            </label>
            <label className={styles.privacy}>
              <input name="privacyAccepted" type="checkbox" required />
              Accepto que les meves dades s’utilitzin per gestionar aquesta sol·licitud.
            </label>
            <div className={styles.honeypot} aria-hidden="true">
              <label>No empleneu aquest camp<input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            {reservationError && <p className={styles.error} role="alert">{reservationError}</p>}
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  setQuote(null);
                  setQuoteMessage("");
                  setReservationError("");
                  setReservationKey(null);
                }}
              >
                Canvia les dates
              </button>
              <button className={styles.primaryButton} type="submit" disabled={sending}>
                {sending ? "Enviant…" : "Envia la sol·licitud"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
