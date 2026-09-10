import { routing } from "@/i18n/routing";

/**
 * Non-default languages the site offers — derived from the single source of
 * truth (i18n/routing.ts) rather than re-typed here, so adding/removing a
 * locale only ever requires touching routing.ts, messages/*.json and the
 * matching backend CHECK constraint (20260610000009_content_translations.sql).
 */
// next-intl types `routing.defaultLocale` as the full locale union rather than
// the narrower "ca" literal it's declared with, so `Exclude<Locale,
// typeof routing.defaultLocale>` resolves to `never` — the literal has to be
// named here instead. The *set* of locales still comes from routing.ts alone.
export type TranslatableLocale = Exclude<(typeof routing.locales)[number], "ca">;
export const TRANSLATABLE_LOCALES = routing.locales.filter(
  (locale): locale is TranslatableLocale => locale !== routing.defaultLocale,
);

/** Display names for the admin-only translation editors (contingut, ressenyes). */
export const LOCALE_DISPLAY_NAMES: Record<TranslatableLocale, string> = {
  es: "Castellà (es)",
  en: "Anglès (en)",
  nl: "Neerlandès (nl)",
  fr: "Francès (fr)",
};

export interface AdminPropertyContent {
  property_id: number;
  name: string;
  slug: string;
  description: string | null;
  description_translations: Partial<Record<TranslatableLocale, string>>;
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  check_in_time: string;
  check_out_time: string;
  published: boolean;
}

export type MediaCategory = "exterior" | "interior" | "amenities" | "surroundings";

export interface AdminPropertyMedia {
  id: string;
  property_id: number;
  storage_path: string;
  category: MediaCategory;
  alt_text: string;
  caption: string | null;
  sort_order: number;
  published: boolean;
}

export interface AdminReview {
  id: string;
  property_id: number;
  display_name: string;
  rating: number;
  comment: string;
  comment_translations: Partial<Record<TranslatableLocale, string>>;
  source: string | null;
  source_url: string | null;
  stay_month: string | null;
  published: boolean;
  published_at: string | null;
}

export interface AdminProperty {
  id: number;
  max_guests: number;
  max_infants: number;
  base_nightly_price: number;
  base_minimum_nights: number;
  currency: "EUR";
  minimum_advance_days: number;
  booking_horizon_days: number;
  request_hold_minutes: number;
  active: boolean;
}

export interface RatePeriod {
  id: string;
  property_id: number;
  name: string;
  stay_period: string;
  nightly_price: number;
  minimum_nights: number;
  priority: number;
  active: boolean;
}

export interface FeeRule {
  id: string;
  property_id: number;
  code: string;
  label: string;
  calculation: "per_stay" | "per_night";
  amount: number;
  valid_period: string | null;
  active: boolean;
  sort_order: number;
}

export type ReservationStatus =
  | "requested"
  | "payment_pending"
  | "confirmed"
  | "cancelled"
  | "expired";

export interface AdminReservation {
  id: string;
  public_reference: string;
  status: ReservationStatus;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  infants: number;
  nights: number;
  total_amount: number;
  currency: string;
  guest_message: string | null;
  requested_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}
