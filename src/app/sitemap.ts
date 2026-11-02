import type { MetadataRoute } from "next";

import { ROUTES } from "@/constants/routes";
import { absoluteUrl } from "@/lib/utils/url";
import {
  listActiveCategorySlugsForSitemap,
  listActiveProductSlugsForSitemap,
} from "@/lib/supabase/queries";

// A capstone catalog doesn't need hourly sitemap regeneration; new
// products/categories still appear automatically within this window.
export const revalidate = 21600; // 6h

const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: ROUTES.home, priority: 1, changeFrequency: "daily" },
  { path: ROUTES.products, priority: 0.9, changeFrequency: "daily" },
  { path: ROUTES.categories, priority: 0.7, changeFrequency: "weekly" },
  { path: ROUTES.assistant, priority: 0.6, changeFrequency: "weekly" },
  { path: ROUTES.cart, priority: 0.3, changeFrequency: "monthly" },
  { path: ROUTES.signIn, priority: 0.2, changeFrequency: "yearly" },
  { path: ROUTES.signUp, priority: 0.2, changeFrequency: "yearly" },
  { path: ROUTES.forgotPassword, priority: 0.1, changeFrequency: "yearly" },
];

/**
 * Public, crawlable routes only — everything under `PROTECTED_ROUTE_PREFIXES`
 * (dashboard/account/orders/checkout/notifications/profile) and auth-flow-only
 * routes (reset-password, auth/callback) are deliberately excluded. Product/
 * category slugs are fetched live via the cookie-free anon client so this
 * stays static/ISR-eligible instead of hitting the DB on every crawl request.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    listActiveProductSlugsForSitemap().catch(() => []),
    listActiveCategorySlugsForSitemap().catch(() => []),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(
    ({ path, priority, changeFrequency }) => ({
      url: absoluteUrl(path),
      priority,
      changeFrequency,
    }),
  );

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: absoluteUrl(ROUTES.productDetail(product.slug)),
    lastModified: product.updatedAt,
    priority: 0.6,
    changeFrequency: "daily",
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: absoluteUrl(ROUTES.categoryDetail(category.slug)),
    lastModified: category.updatedAt,
    priority: 0.5,
    changeFrequency: "weekly",
  }));

  return [...staticEntries, ...productEntries, ...categoryEntries];
}
