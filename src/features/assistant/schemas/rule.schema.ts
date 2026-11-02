import { z } from "zod";

import { OCCASIONS } from "@/constants/occasions";

/** Must match the `recommendation_occasion` Postgres enum exactly. */
export { OCCASIONS } from "@/constants/occasions";

export const occasionSchema = z.enum(OCCASIONS);

/**
 * Canonical size choices for Guided Selection. Unlike occasion, `size` has
 * no backing Postgres enum — `recommendation_rules.size`/`product_variants.size`
 * stay free text in the DB (the original migration's rationale: garment
 * sizing isn't one universal vocabulary — S/M/L for shirts, numeric for
 * shoes). This fixed list narrows that down to apparel sizing, which is the
 * catalog's actual scope today, and is enforced here at the Zod boundary —
 * the same enum-validation shape as `occasionSchema` — so a buyer's
 * selection and a seller's rule are always drawn from the same vocabulary
 * instead of a free-text field that could never reliably match one typed by
 * someone else. If the catalog ever needs non-apparel sizing (shoes,
 * numeric), this list is the one place to widen it.
 */
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One Size"] as const;
export const sizeSchema = z.enum(SIZES);

/**
 * Type guard for a *stored* (unvalidated) size string — `recommendation_rules.size`
 * has no DB enum backing `sizeSchema`, so a row read back from the database
 * isn't guaranteed to be a `SIZES` member (e.g. a legacy value, or one
 * written outside this app). Used when seeding edit-form state from an
 * existing rule, so an out-of-vocabulary stored value degrades to "no
 * selection" instead of being force-cast into the union.
 */
export function isGuidedSelectionSize(
  value: string | null | undefined,
): value is (typeof SIZES)[number] {
  return sizeSchema.safeParse(value).success;
}

/**
 * A rule's editable attributes. No budget field here — see the
 * `recommendation_rules` migration's header comment; budget is matched
 * against live price by the buyer-facing quiz, never stored on a rule.
 */
export const recommendationRuleSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().optional(),
  occasion: occasionSchema.optional(),
  size: sizeSchema.optional(),
});

export const updateRecommendationRuleSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid().optional(),
  occasion: occasionSchema.optional(),
  size: sizeSchema.optional(),
  active: z.boolean().optional(),
});

export const deleteRecommendationRuleSchema = z.object({
  id: z.uuid(),
});

export type RecommendationRuleFormInput = z.infer<typeof recommendationRuleSchema>;
export type UpdateRecommendationRuleInput = z.infer<typeof updateRecommendationRuleSchema>;
export type DeleteRecommendationRuleInput = z.infer<typeof deleteRecommendationRuleSchema>;
