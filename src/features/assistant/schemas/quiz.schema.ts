import { z } from "zod";

import { occasionSchema, sizeSchema } from "@/features/assistant/schemas/rule.schema";

/**
 * Buyer-facing Guided Selection query — every criterion is optional
 * independently (a buyer can skip occasion, size, or budget and still get
 * matches), same convention as `recommendationRuleSchema`'s nullable criteria.
 * `size` reuses `sizeSchema` rather than redeclaring its own string
 * validation, so the buyer's query and a seller's rule are enforced against
 * the exact same vocabulary.
 */
export const guidedSelectionQuerySchema = z
  .object({
    occasion: occasionSchema.optional(),
    size: sizeSchema.optional(),
    /**
     * Category scope + the new color/material/dimensions answers (§6 of the
     * implementation plan) — resolved against variant/product data, not a
     * `recommendation_rules` column (unlike `size`/`occasion` above). Only
     * meaningful alongside `categoryId`, same "ambiguous across categories"
     * rule the catalog's own attribute filters use.
     */
    categoryId: z.uuid().optional(),
    color: z.string().trim().max(60).optional(),
    material: z.string().trim().max(60).optional(),
    dimensions: z.string().trim().max(80).optional(),
    /** Major-unit pesos (not cents), same convention as `productListParamsSchema`. */
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().positive().optional(),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    {
      message: "Minimum budget must be less than or equal to maximum budget.",
      path: ["minPrice"],
    },
  );

export type GuidedSelectionQueryInput = z.infer<typeof guidedSelectionQuerySchema>;
