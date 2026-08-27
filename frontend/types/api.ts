export type SupabaseApiPath =
  | `/rest/v1/${string}`
  | `/functions/v1/${string}`;

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}
