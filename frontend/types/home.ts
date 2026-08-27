export interface PropertyRow {
  id: number;
  max_guests: number;
  max_infants: number;
  base_nightly_price: number;
  base_minimum_nights: number;
  currency: "EUR";
  minimum_advance_days: number;
  booking_horizon_days: number;
}

export interface PropertyContentRow {
  property_id: number;
  name: string;
  slug: string;
  description: string | null;
  bedrooms: number;
  bathrooms: number;
  amenities: string[];
  check_in_time: string;
  check_out_time: string;
}

export type MediaCategory =
  | "exterior"
  | "interior"
  | "amenities"
  | "surroundings";

export interface PropertyMediaRow {
  id: string;
  property_id: number;
  storage_path: string;
  category: MediaCategory;
  alt_text: string;
  caption: string | null;
  sort_order: number;
}

export interface ReviewRow {
  id: string;
  property_id: number;
  display_name: string;
  rating: number;
  comment: string;
  source: string | null;
  stay_month: string | null;
  published_at: string;
}

export interface PublicPropertyMedia extends PropertyMediaRow {
  url: string;
}

export interface HomeData {
  property: PropertyRow | null;
  content: PropertyContentRow | null;
  media: PublicPropertyMedia[];
  reviews: ReviewRow[];
}
