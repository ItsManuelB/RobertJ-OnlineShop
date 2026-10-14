import { z } from "zod";

/** Payload for creating a category. `slug` is always server-derived from `name` (see `queries.createCategory`). */
export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  imageUrl: z
    .string()
    .trim()
    .url("Must be a valid http(s) URL.")
    .refine((value) => /^https?:\/\//.test(value), "Must be a valid http(s) URL.")
    .optional()
    .or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

/** Payload for editing a category. */
export const updateCategorySchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name is required.").max(80),
  description: z.string().trim().max(500).optional(),
  imageUrl: z
    .string()
    .trim()
    .url("Must be a valid http(s) URL.")
    .refine((value) => /^https?:\/\//.test(value), "Must be a valid http(s) URL.")
    .optional()
    .or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

/** Payload for toggling a category's active status — a plain-argument action, not a form (see `toggleCategoryActiveAction`). */
export const toggleCategoryActiveSchema = z.object({
  categoryId: z.uuid(),
  active: z.boolean(),
});

/**
 * Payload for creating/editing one `category_attributes` row — a
 * plain-argument action (checkboxes + a picklist editor, not a plain
 * <form> submit), mirroring `recommendationRuleSchema`'s `input: unknown`
 * pattern. The two-layer requiredness model (plan §3.5) is enforced here
 * too, not just at the DB — a client never gets as far as the DB's CHECK
 * constraint for an invalid combination.
 */
export const upsertCategoryAttributeSchema = z
  .object({
    categoryId: z.uuid(),
    attributeKey: z.enum(["color", "size", "material", "dimensions"]),
    isRequired: z.boolean(),
    isVariantEligible: z.boolean(),
    isRecommended: z.boolean(),
    /** Comma-separated in the UI; split/trimmed/filtered here. Empty = free text (null). */
    allowedValues: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .nullable(),
  })
  .refine((value) => !(value.isRequired && value.isVariantEligible), {
    message: "An attribute can't be both a hard-required spec and a seller opt-in variant axis.",
    path: ["isVariantEligible"],
  })
  .refine((value) => !(value.isRecommended && !value.isVariantEligible), {
    message: "\"Recommended\" only applies to a variant-eligible attribute.",
    path: ["isRecommended"],
  });

/** Payload for removing a `category_attributes` row — a plain-argument action. */
export const deleteCategoryAttributeSchema = z.object({
  id: z.uuid(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ToggleCategoryActiveInput = z.infer<typeof toggleCategoryActiveSchema>;
export type UpsertCategoryAttributeInput = z.infer<typeof upsertCategoryAttributeSchema>;
export type DeleteCategoryAttributeInput = z.infer<typeof deleteCategoryAttributeSchema>;
