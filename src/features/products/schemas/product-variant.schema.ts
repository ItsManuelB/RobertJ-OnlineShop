import { z } from "zod";

import { productStatusSchema } from "@/features/products/schemas/product.schema";

/**
 * A variant's editable catalog attributes. Stock is never here — see
 * `adjustStockSchema` (variants are adjusted through the same `adjust_stock`
 * RPC path as a plain product, just with `variantId` set).
 *
 * `material`/`dimensions` are per-variant OVERRIDES of the parent product's
 * own `material`/`dimensions` (same nullable-inherits pattern as `price` —
 * see docs/plans/product-specifications-and-variants-implementation.md
 * §3.2). Length caps mirror `product_variants`' own DB CHECK constraints
 * (material `<= 60`, dimensions `<= 80`). The refine below generalizes from
 * "color or size" to any of the four attributes, matching the DB's
 * generalized `product_variants_has_attribute` CHECK — a Decors variant
 * identified purely by material or dimensions is valid here too.
 */
export const productVariantSchema = z
  .object({
    productId: z.uuid(),
    sku: z.string().trim().max(60).optional(),
    color: z.string().trim().max(60).optional(),
    size: z.string().trim().max(60).optional(),
    material: z.string().trim().max(60).optional(),
    dimensions: z.string().trim().max(80).optional(),
    /** Major-unit pesos; leave blank to inherit the parent product's price. */
    price: z.coerce.number().positive("Price must be greater than zero.").optional(),
  })
  .refine(
    (value) => Boolean(value.color) || Boolean(value.size) || Boolean(value.material) || Boolean(value.dimensions),
    {
      message: "Enter at least one option (color, size, material, or dimensions).",
      path: ["color"],
    },
  );

export const updateProductVariantSchema = z
  .object({
    id: z.uuid(),
    sku: z.string().trim().max(60).optional(),
    color: z.string().trim().max(60).optional(),
    size: z.string().trim().max(60).optional(),
    material: z.string().trim().max(60).optional(),
    dimensions: z.string().trim().max(80).optional(),
    price: z.coerce.number().positive("Price must be greater than zero.").optional(),
    status: productStatusSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.color) || Boolean(value.size) || Boolean(value.material) || Boolean(value.dimensions),
    {
      message: "Enter at least one option (color, size, material, or dimensions).",
      path: ["color"],
    },
  );

export const deleteProductVariantSchema = z.object({
  id: z.uuid(),
});

export type ProductVariantFormInput = z.infer<typeof productVariantSchema>;
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;
export type DeleteProductVariantInput = z.infer<typeof deleteProductVariantSchema>;
