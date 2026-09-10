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
