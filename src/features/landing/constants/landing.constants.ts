import { CATEGORY_FALLBACK_IMAGES } from "@/constants/category-images";
import type { LandingStat } from "@/features/landing/types/landing.types";

/** Rotating top-bar promos. Pure marketing copy — not modelled in the DB. */
export const ANNOUNCEMENTS = [
  "Cash on Delivery or GCash, Maya, and Card  ·  Shop Now →",
  "One cart across all three shops  ·  Explore the Marketplace →",
  "Secure checkout with manually verified payments",
] as const;

/** Trust-signal strip that scrolls beneath the hero. */
export const MARQUEE_ITEMS = [
  "New Arrivals Weekly",
  "Three Trusted Sibling Shops",
  "Cash on Delivery or GCash/Maya/Card",
  "Manually Verified Payments",
  "One Catalog, Three Shops",
  "Easy Returns",
] as const;

/**
 * Hero headline metrics — all backed by live, non-sensitive Supabase row counts
 * (the number here is only a fallback shown if the count query fails). No
 * fabricated figure is presented as fact: the former "Happy Buyers: 50,000+"
 * placeholder is now a real registered-buyer count.
 */
export const HERO_STATS: LandingStat[] = [
  { value: 0, suffix: "+", label: "Active Shops", source: "live", metric: "sellerCount" },
  { value: 0, suffix: "+", label: "Products Listed", source: "live", metric: "productCount" },
  { value: 0, suffix: "+", label: "Registered Buyers", source: "live", metric: "buyerCount" },
];

/**
 * About-section metrics — all live, non-sensitive counts. The former
 * "Sales Processed ₱18M+" (a fabricated aggregate we deliberately don't expose
 * publicly) and "Average Rating 4.8★" (no cheap aggregate, sparse early data)
 * placeholders are replaced with a real orders-fulfilled count; buyers and
 * shops are real counts too.
 */
export const ABOUT_STATS: LandingStat[] = [
  { value: 0, suffix: "+", label: "Verified Shops", source: "live", metric: "sellerCount" },
  { value: 0, suffix: "+", label: "Products Listed", source: "live", metric: "productCount" },
  { value: 0, suffix: "+", label: "Orders Fulfilled", source: "live", metric: "fulfilledOrderCount" },
  { value: 0, suffix: "+", label: "Registered Buyers", source: "live", metric: "buyerCount" },
];

/**
 * Shown only when the categories table has not been seeded yet. The count
 * labels are an honest "Explore" (the tiles link to the real, working
 * `/products` page) rather than fabricated item counts presented as real.
 */
export const CATEGORY_PLACEHOLDERS = [
  { name: "Shirts & Tops", countLabel: "Explore", imageUrl: CATEGORY_FALLBACK_IMAGES[0] },
  { name: "Bottoms", countLabel: "Explore", imageUrl: CATEGORY_FALLBACK_IMAGES[1] },
  { name: "Outerwear", countLabel: "Explore", imageUrl: CATEGORY_FALLBACK_IMAGES[2] },
  { name: "Decors", countLabel: "Explore", imageUrl: CATEGORY_FALLBACK_IMAGES[3] },
] as const;

/**
 * Bullet points beside the Guided Selection preview. Describes the real
 * mechanism (DECISIONS.md ADR-009 — explicit, human-authored rules, never
 * AI/ML) — no natural-language or "learns over time" claims.
 */
export const ASSISTANT_BENEFITS = [
  "Matches by occasion, size, and budget — no guesswork",
  "Searches every shop's rules at once",
  "Budget is always checked against the live price",
  "Every match traces back to a rule a seller explicitly set — no black box",
] as const;
