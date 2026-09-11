import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/**
 * Lets next/image optimize (resize, re-encode, lazy-load) photos served
 * from Supabase Storage — without this, next/image throws at request time
 * for any src outside the app's own domain, which previously forced the
 * property-photo gallery onto plain CSS background-images instead: no
 * responsive sizes, no lazy-loading, full-resolution files shipped to
 * every device regardless of viewport.
 *
 * Derived from NEXT_PUBLIC_SUPABASE_URL rather than hardcoded so this
 * keeps working unchanged across local dev, pre-prod, and production.
 * Scoped to the public property-media path only — least privilege, not a
 * blanket allow for the whole Supabase project domain.
 */
function supabaseImageRemotePattern(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return [];
  try {
    const { protocol, hostname, port } = new URL(supabaseUrl);
    if (protocol !== "http:" && protocol !== "https:") return [];
    return [{
      protocol: protocol.slice(0, -1) as "http" | "https",
      hostname,
      port,
      pathname: "/storage/v1/object/public/property-media/**",
    }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImageRemotePattern(),
  },
};

export default withNextIntl(nextConfig);
