"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useMemo, useState } from "react";
import {
  createReservationKey,
  getStayQuote,
  ReservationRequestError,
  sendReservationRequest,
  type ReservationResponse,
  type StayQuote,
} from "@/lib/booking";
import { formatMoney } from "@/lib/intl-format";
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

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function BookingFlow({
  minimumAdvanceDays = 1,
  bookingHorizonDays = 730,
  maxGuests,
  maxInfants,
}: BookingFlowProps) {
  const t = useTranslations("Booking");
  const locale = useLocale();

  function selectionError(selection: Selection): string | null {
    if (!validDate(selection.arrival) || !validDate(selection.departure)) {
      return t("invalidDates");
    }
    if (selection.departure <= selection.arrival) {
      return t("departureAfterArrival");
    }
    if (!Number.isSafeInteger(selection.adults) || selection.adults < 1
        || !Number.isSafeInteger(selection.children) || selection.children < 0
        || !Number.isSafeInteger(selection.infants) || selection.infants < 0) {
      return t("invalidGuestCount");
    }
    if (maxGuests !== undefined && selection.adults + selection.children > maxGuests) {
      return t("capacityExceeded", { max: maxGuests });
    }
    if (maxInfants !== undefined && selection.infants > maxInfants) {
      return t("infantsExceeded", { max: maxInfants });
    }
    return null;
  }

  function quoteError(error: unknown): string {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("MINIMUM_NIGHTS_NOT_MET")) return t("errorMinimumNights");
    if (message.includes("CAPACITY_EXCEEDED")) return t("errorCapacity");
    if (message.includes("STAY_OUTSIDE_BOOKING_WINDOW")) return t("errorBookingWindow");
    if (message.includes("INVALID_STAY_DATES")) return t("errorInvalidDates");
    return t("errorGeneric");
  }

  function reservationErrorMessage(error: unknown): string {
    if (!(error instanceof ReservationRequestError)) return t("reservationErrorGeneric");
    switch (error.code) {
      case "conflict": return t("reservationErrorConflict");
      case "rateLimited": return t("reservationErrorRateLimited");
      case "forbidden": return t("reservationErrorForbidden");
      case "validation": return t("reservationErrorValidation");
      default: return t("reservationErrorSendFailed");
    }
  }

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
    const validationError = selectionError(selection);
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
      if (!result.available) setQuoteMessage(t("notAvailable"));
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
        locale,
      }, key);
      setReservation(result);
    } catch (error) {
      setReservationError(reservationErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  if (reservation?.ok) {
    return (
      <section className={styles.booking} id="reserva" aria-labelledby="booking-title">
        <div className={styles.success} role="status" data-testid="booking-success">
          <p className={styles.kicker}>{t("successTitle")}</p>
          <h2 id="booking-title">{t("successHeading")}</h2>
          {reservation.reference && <p>{t("reference")} <strong data-testid="booking-reference">{reservation.reference}</strong></p>}
          <p>{t("successBody")}</p>
          {reservation.warning && <p>{reservation.warning}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.booking} id="reserva" aria-labelledby="booking-title">
      <div className={styles.intro}>
        <p className={styles.kicker}>{t("kicker")}</p>
        <h2 id="booking-title">{t("title")}</h2>
        <p>{t("intro")}</p>
      </div>

      <div className={styles.panel}>
        <form className={styles.selectionForm} onSubmit={checkAvailability}>
          <div className={styles.fieldGrid}>
            <label>
              {t("arrival")}
              <input
                type="date"
                required
                min={earliest}
                max={latest}
                value={selection.arrival}
                onChange={(event) => updateSelection("arrival", event.target.value)}
                data-testid="booking-arrival"
              />
            </label>
            <label>
              {t("departure")}
              <input
                type="date"
                required
                min={selection.arrival || earliest}
                max={latest}
                value={selection.departure}
                onChange={(event) => updateSelection("departure", event.target.value)}
                data-testid="booking-departure"
              />
            </label>
            <label>
              {t("adults")}
              <input
                type="number"
                required
                min={1}
                max={adultsMax}
                value={selection.adults}
                onChange={(event) => updateSelection("adults", Number(event.target.value))}
                data-testid="booking-adults"
              />
            </label>
            <label>
              {t("children")}
              <input
                type="number"
                min={0}
                max={childrenMax}
                value={selection.children}
                onChange={(event) => updateSelection("children", Number(event.target.value))}
                data-testid="booking-children"
              />
            </label>
            <label>
              {t("infants")}
              <input
                type="number"
                min={0}
                max={infantsMax}
                value={selection.infants}
                onChange={(event) => updateSelection("infants", Number(event.target.value))}
                data-testid="booking-infants"
              />
            </label>
          </div>
          {knownCapacity && (
            <p className={styles.hint}>{t("capacityHint", { max: adultsMax, maxInfants: maxInfants ?? 0 })}</p>
          )}
          <button className={styles.primaryButton} type="submit" disabled={checking} data-testid="booking-check-availability">
            {checking ? t("checking") : t("checkAvailability")}
          </button>
        </form>

        {quoteMessage && <p className={styles.error} role="alert" data-testid="booking-quote-error">{quoteMessage}</p>}

        {quote?.available && (
          <div className={styles.quote} role="status" data-testid="booking-quote">
            <div>
              <p className={styles.available}>{t("available")}</p>
              <strong>{t("night", { count: quote.nights })}</strong>
            </div>
            <dl>
              <div><dt>{t("accommodation")}</dt><dd>{formatMoney(quote.nightly_subtotal, quote.currency, locale)}</dd></div>
              {quote.fees_total > 0 && <div><dt>{t("feesAndServices")}</dt><dd>{formatMoney(quote.fees_total, quote.currency, locale)}</dd></div>}
              <div className={styles.total}><dt>{t("total")}</dt><dd>{formatMoney(quote.total_amount, quote.currency, locale)}</dd></div>
            </dl>
          </div>
        )}

        {quote?.available && (
          <form className={styles.guestForm} onSubmit={submitReservation}>
            <h3>{t("requestTitle")}</h3>
            <p>{t("requestIntro")}</p>
            <div className={styles.contactGrid}>
              <label>{t("firstName")}<input name="firstName" required minLength={1} maxLength={120} autoComplete="given-name" data-testid="booking-first-name" /></label>
              <label>{t("lastName")}<input name="lastName" required minLength={1} maxLength={160} autoComplete="family-name" data-testid="booking-last-name" /></label>
              <label>{t("email")}<input name="email" type="email" required maxLength={320} autoComplete="email" data-testid="booking-email" /></label>
              <label>{t("phone")} <span>{t("optional")}</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" data-testid="booking-phone" /></label>
            </div>
            <label>{t("message")} <span>{t("optional")}</span>
              <textarea name="message" maxLength={5000} rows={4} placeholder={t("messagePlaceholder")} />
            </label>
            <label className={styles.privacy}>
              <input name="privacyAccepted" type="checkbox" required data-testid="booking-privacy-accept" />
              {t("privacyAccept")}
            </label>
            <div className={styles.honeypot} aria-hidden="true">
              <label>{t("honeypotLabel")}<input name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>
            {reservationError && <p className={styles.error} role="alert" data-testid="booking-reservation-error">{reservationError}</p>}
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
                {t("changeDates")}
              </button>
              <button className={styles.primaryButton} type="submit" disabled={sending} data-testid="booking-submit">
                {sending ? t("sending") : t("send")}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
