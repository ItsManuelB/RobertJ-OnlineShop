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

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional().catch(undefined);
const optionalPesos = z.coerce.number().nonnegative().max(10_000_000).optional().catch(undefined);

/**
 * The `/assistant` address. Never throws: a bad or tampered value is simply dropped, so an
 * old or hand-edited link still opens the page. A minimum above the maximum drops both.
 */
export const guidedSelectionPageParamsSchema = z
  .object({
    category: z.uuid().optional().catch(undefined),
    occasion: occasionSchema.optional().catch(undefined),
    size: optionalText(60),
    color: optionalText(60),
    material: optionalText(60),
    dimensions: optionalText(80),
    min: optionalPesos,
    max: optionalPesos,
    step: z.enum(["category", "occasion", "details", "budget"]).optional().catch(undefined),
    show: z.literal("1").optional().catch(undefined),
  })
  .transform((value) => {
    const budgetValid = value.min === undefined || value.max === undefined || value.min <= value.max;
    return {
      answers: {
        categoryId: value.category,
        occasion: value.occasion,
        size: value.size,
        color: value.color,
        material: value.material,
        dimensions: value.dimensions,
        minPrice: budgetValid ? value.min : undefined,
        maxPrice: budgetValid ? value.max : undefined,
      },
      step: value.step,
      show: value.show === "1",
    };
  });
