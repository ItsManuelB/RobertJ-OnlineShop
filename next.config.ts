import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Pin the workspace root; a lockfile exists higher up in the user profile.
  turbopack: { root: import.meta.dirname },
  experimental: {
    // Turbopack's build cache records the values of the env vars it read,
    // including server secrets (CRON_SECRET, XENDIT_WEBHOOK_TOKEN), and Netlify's
    // secret scanner fails the deploy when it finds them in that cache file.
    // The hosted build starts clean each time anyway, so skip writing it.
    turbopackFileSystemCacheForBuild: false,
    serverActions: {
      // Product photo / payment receipt uploads allow files up to 5MB (see
      // MAX_PRODUCT_IMAGE_BYTES / the storage buckets' file_size_limit) —
      // Next's default Server Action body limit is 1MB, which silently
      // rejected any upload above that before it ever reached validation.
      bodySizeLimit: "6mb",
    },
  },
  images: {
    // Product images are served from Supabase Storage. Add further hosts
    // explicitly rather than widening this to all of https.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/**" }]
      : [],
  },
};

export default nextConfig;
