import { getSupabasePublicConfig } from "@/lib/env";
import { supabaseFetch } from "@/lib/supabase";
import type {
  HomeData,
  PropertyContentRow,
  PropertyMediaRow,
  PropertyRow,
  PublicPropertyMedia,
  ReviewRow,
} from "@/types/home";

const PROPERTY_SELECT = [
  "id",
  "max_guests",
  "max_infants",
  "base_nightly_price",
  "base_minimum_nights",
  "currency",
  "minimum_advance_days",
  "booking_horizon_days",
].join(",");

const CONTENT_SELECT = [
  "property_id",
  "name",
  "slug",
  "description",
  "bedrooms",
  "bathrooms",
  "amenities",
  "check_in_time",
  "check_out_time",
].join(",");

const MEDIA_SELECT = [
  "id",
  "property_id",
  "storage_path",
  "category",
  "alt_text",
  "caption",
  "sort_order",
].join(",");

const REVIEW_SELECT = [
  "id",
  "property_id",
  "display_name",
  "rating",
  "comment",
  "source",
  "stay_month",
  "published_at",
].join(",");

function publicMediaUrl(storagePath: string): string {
  const { url } = getSupabasePublicConfig();
  const encodedPath = storagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${url}/storage/v1/object/public/property-media/${encodedPath}`;
}

export async function getHomeData(): Promise<HomeData> {
  const properties = await supabaseFetch<PropertyRow[]>(
    `/rest/v1/properties?select=${PROPERTY_SELECT}&id=eq.1&active=eq.true&limit=1`,
  );
  const property = properties[0] ?? null;

  if (!property) {
    return { property: null, content: null, media: [], reviews: [] };
  }

  const [contents, mediaRows, reviews] = await Promise.all([
    supabaseFetch<PropertyContentRow[]>(
      `/rest/v1/property_content?select=${CONTENT_SELECT}&property_id=eq.${property.id}&published=eq.true&limit=1`,
    ),
    supabaseFetch<PropertyMediaRow[]>(
      `/rest/v1/property_media?select=${MEDIA_SELECT}&property_id=eq.${property.id}&published=eq.true&order=sort_order.asc&limit=6`,
    ),
    supabaseFetch<ReviewRow[]>(
      `/rest/v1/reviews?select=${REVIEW_SELECT}&property_id=eq.${property.id}&published=eq.true&order=published_at.desc&limit=3`,
    ),
  ]);

  const media: PublicPropertyMedia[] = mediaRows.map((item) => ({
    ...item,
    url: publicMediaUrl(item.storage_path),
  }));

  return {
    property,
    content: contents[0] ?? null,
    media,
    reviews,
  };
}
