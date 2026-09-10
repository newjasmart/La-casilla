/**
 * Single source of truth for locale → BCP-47 tag and the Intl formatters
 * built from it. Previously this map (and the money/time formatting it
 * feeds) was hand-duplicated in home-content.tsx, booking-flow.tsx and
 * admin/reserves/page.tsx — any new locale had to be added in three places
 * that could silently drift.
 */
export const INTL_LOCALE_TAGS: Record<string, string> = {
  ca: "ca-ES",
  es: "es-ES",
  en: "en-GB",
  nl: "nl-NL",
  fr: "fr-FR",
};

function intlTag(locale: string): string {
  return INTL_LOCALE_TAGS[locale] ?? locale;
}

export function formatMoney(
  value: number,
  currency: string,
  locale: string,
  options?: Pick<Intl.NumberFormatOptions, "maximumFractionDigits">,
): string {
  return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency, ...options }).format(value);
}

export function formatClockTime(value: string, locale: string): string {
  const [hours, minutes] = value.split(":");
  const date = new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes)));
  return new Intl.DateTimeFormat(intlTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatMonthYear(value: string, locale: string): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
