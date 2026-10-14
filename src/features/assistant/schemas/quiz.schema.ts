import { z } from "zod";

import { occasionSchema } from "@/features/assistant/schemas/rule.schema";

/**
 * Buyer-facing Guided Selection query — every criterion is optional
 * independently (a buyer can skip occasion, size, or budget and still get
 * matches), same convention as `recommendationRuleSchema`'s nullable criteria.
 * Size, like color/material/dimensions, is free text here: the quiz offers the
 * category's own values (`resolveFilterableAttributes`) and the matcher compares
 * them against the product's real options (ADR-022).
 */
export const guidedSelectionQuerySchema = z
  .object({
    occasion: occasionSchema.optional(),
    size: z.string().trim().max(60).optional(),
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
