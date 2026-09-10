import { getSupabasePublicConfig } from "@/lib/env";

export function publicMediaUrl(storagePath: string): string {
  const { url } = getSupabasePublicConfig();
  const encodedPath = storagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${url}/storage/v1/object/public/property-media/${encodedPath}`;
}
