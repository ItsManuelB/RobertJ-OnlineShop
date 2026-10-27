import type { Product } from "@/features/products";
import type { SIZES } from "@/features/assistant/schemas/rule.schema";

/**
 * Guided Product Selection is rule-based (DECISIONS.md ADR-009) — never
 * AI/ML. A rule is an explicit, human-authored row: recommend `productId`
 * (optionally a specific `variantId`) whenever a buyer's occasion/size
 * answers match. Budget is intentionally not part of a rule — see the
 * `recommendation_rules` migration's header comment; it's matched against
 * the recommended product's/variant's live price by the buyer-facing quiz
 * (`getGuidedSelectionResults` for the `/assistant` page).
 */
export type RecommendationOccasion =
  | "casual"
  | "formal"
  | "work"
  | "sportswear"
  | "party"
  | "wedding"
  | "everyday";

/**
 * Validated input shape for `size` — `(typeof SIZES)[number]` from
 * `rule.schema.ts`'s `sizeSchema`, the same enum-validation shape as
 * `RecommendationOccasion`. Only for *input* types (`RecommendationRuleInput`,
 * `GuidedSelectionMatchInput`): unlike occasion, `size` has no backing
 * Postgres enum, so a *stored* row's `size` stays `string | null` below —
 * narrowing reads to this union would claim a DB guarantee that doesn't
 * exist.
 */
export type RecommendationSize = (typeof SIZES)[number];

/** Domain model returned by the assistant service to the rest of the app. */
export interface RecommendationRule {
  id: string;
  productId: string;
  variantId: string | null;
  sellerId: string;
  shopId: string | null;
  /** `null` = matches any occasion. */
  occasion: RecommendationOccasion | null;
  /** `null` = matches any size. */
  size: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Live-joined display fields — never stored on the rule itself. */
  productTitle: string;
  productSlug: string;
  /** e.g. "Blue / Medium", or null when the rule doesn't target a specific variant. */
  variantLabel: string | null;
}

/**
 * One buyer-facing Guided Selection result, matched straight from the live
 * catalog (ADR-022). `matchedPriceCents` is a live read: the matched option's
 * price when it has its own, else the product's.
 */
export interface GuidedSelectionMatch {
  product: Product;
  /** The in-stock option that satisfied the buyer's answers; null when none was asked. */
  variantId: string | null;
  /** e.g. "Blue / Medium", or null when the match isn't variant-specific. */
  variantLabel: string | null;
  matchedPriceCents: number;
  /**
   * "exact" satisfies every answer; "close" misses only the budget, by `note`;
   * "unconfirmed" fits the rest but the product has no size/color data to
   * check (`note` says which) — shown last, never as an exact match.
   */
  fit: "exact" | "close" | "unconfirmed";
  note: string | null;
  /** Short reasons it fits, e.g. ["Good for Casual", "Black"] — only answers that were confirmed. */
  reasons: string[];
}
