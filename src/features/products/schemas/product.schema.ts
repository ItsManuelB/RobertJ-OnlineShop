import { z } from "zod";

import { PAGINATION } from "@/constants/pagination";
import { PRODUCT_CONDITION, PRODUCT_STATUS } from "@/constants/status";

export const productStatusSchema = z.enum([
  PRODUCT_STATUS.draft,
  PRODUCT_STATUS.active,
  PRODUCT_STATUS.sold,
  PRODUCT_STATUS.archived,
]);

export const productConditionSchema = z.enum([
  PRODUCT_CONDITION.new,
  PRODUCT_CONDITION.likeNew,
  PRODUCT_CONDITION.good,
  PRODUCT_CONDITION.fair,
  PRODUCT_CONDITION.poor,
]);

export const productSortSchema = z.enum([
  "newest",
  "price-asc",
  "price-desc",
  "title-asc",
]);

/** Validates and normalises search params for the product listing. */
export const productListParamsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.maxPageSize)
      .default(PAGINATION.defaultPageSize),
    search: z.string().trim().max(120).optional(),
    categoryId: z.uuid().optional(),
    shopId: z.uuid().optional(),
    sort: productSortSchema.default("newest"),
    // Deliberately not z.coerce.boolean() — Boolean("false") is true, which
    // would make ?onSale=false behave identically to ?onSale=true.
    onSale: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    // Major-unit pesos from the URL; converted to price_cents in listProducts
    // (queries.ts), matching how createProductSchema's `price` is handled.
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    /**
     * Category-driven attribute filters (§7 of the implementation plan) —
     * only meaningful alongside a single `categoryId`; matches if ANY of a
     * product's variants has that value, not necessarily the same variant
     * row across multiple simultaneous filters (documented simplification,
     * same as the plan's own wording).
     */
    color: z.string().trim().max(60).optional(),
    size: z.string().trim().max(60).optional(),
    material: z.string().trim().max(60).optional(),
    dimensions: z.string().trim().max(80).optional(),
  })
  .refine(
    (value) =>
      value.minPrice === undefined ||
      value.maxPrice === undefined ||
      value.minPrice <= value.maxPrice,
    {
      message: "Minimum price must be less than maximum price.",
      path: ["minPrice"],
    },
  );

/** Validates and normalises search params for the Seller/Admin dashboard product listing. */
export const dashboardProductListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxPageSize)
    .default(PAGINATION.defaultPageSize),
  search: z.string().trim().max(120).optional(),
  status: productStatusSchema.optional(),
  categoryId: z.uuid().optional(),
});

/** Shared id-list shape for the dashboard's bulk product actions. */
const bulkProductIdsSchema = z.array(z.uuid()).min(1, "Select at least one product.").max(100);

export const bulkArchiveProductsSchema = z.object({
  ids: bulkProductIdsSchema,
});

export const bulkUpdateProductStatusSchema = z.object({
  ids: bulkProductIdsSchema,
  status: productStatusSchema,
});

export const bulkAssignProductCategorySchema = z.object({
  ids: bulkProductIdsSchema,
  categoryId: z.uuid(),
});

/**
 * Payload for creating a product. `price` arrives in major units from the form
 * and is converted to minor units in the service — the database never sees a
 * fractional amount.
 */
export const createProductSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters.").max(160),
  description: z.string().trim().max(5000).optional(),
  price: z.coerce.number().positive("Price must be greater than zero."),
  quantity: z.coerce.number().int().min(0, "Quantity cannot be negative."),
  condition: productConditionSchema.default(PRODUCT_CONDITION.new),
  categoryId: z.uuid("Select a category.").optional(),
  location: z.string().trim().max(160).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  status: productStatusSchema.default(PRODUCT_STATUS.draft),
  /**
   * Default/spec values for the two new category-driven attributes (see
   * docs/plans/product-specifications-and-variants-implementation.md §3–8).
   * Length caps mirror `products.material`/`products.dimensions`'s own DB
   * CHECK constraints (`<= 160`). Overridable per variant — see
   * `product-variant.schema.ts`.
   */
  material: z.string().trim().max(160).optional(),
  dimensions: z.string().trim().max(160).optional(),
  /**
   * Whether this product appears in the homepage's "Picked for You" section
   * (`listFeaturedProducts`). Checkboxes are absent from FormData when
   * unchecked, hence the string-to-boolean transform (mirrors
   * `productListParamsSchema`'s `onSale`). Gated the same way as every other
   * field here — by who's authorized to create/update *this* product
   * (`createProductAction`/`updateProductAction`), not specially restricted.
   */
  featured: z
    .string()
    .optional()
    .transform((value) => value === "on"),
});

/**
 * What `createProductAction` accepts: the create payload plus an optional
 * client-generated `clientId`. It becomes the new product's primary key, so
 * repeating the same request (a double click, or a retry after a lost
 * response) resolves to the product that already exists instead of creating a
 * duplicate. Deliberately NOT part of `createProductSchema`: the update schema
 * is derived from that one and its fields are written straight to the row.
 */
export const createProductRequestSchema = createProductSchema.extend({
  clientId: z.uuid().optional(),
});

/**
 * A product's shop is never reassignable through the general edit form (see
 * `assignProductShopSchema` for the distinct, admin-only reassignment path)
 * — there's no `shopId` field here to omit, since `createProductSchema`
 * doesn't have one either: only a seller ever creates a product, and their
 * shop is always resolved server-side via `requireOwnShopId()`, never taken
 * from client input.
 */
export const updateProductSchema = createProductSchema.partial().extend({
  id: z.uuid(),
});

/** Admin-only: assign a shop to an unassigned product, or transfer an already-assigned one to a different shop. */
export const assignProductShopSchema = z.object({
  productId: z.uuid(),
  shopId: z.uuid(),
});

/** Mirrors the `product-images` bucket's own file_size_limit/allowed_mime_types
 * (see the storage migration) so the UI fails fast instead of round-tripping
 * to Storage only to be rejected there. */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const uploadProductImageSchema = z.object({
  productId: z.uuid(),
  image: z
    .instanceof(File, { message: "An image is required." })
    .refine((file) => file.size > 0, "An image is required.")
    .refine(
      (file) => file.size <= MAX_PRODUCT_IMAGE_BYTES,
      "Image must be 5MB or smaller.",
    )
    .refine(
      (file) => ALLOWED_PRODUCT_IMAGE_TYPES.includes(file.type),
      "Image must be a JPEG, PNG, or WebP file.",
    ),
});

export const deleteProductImageSchema = z.object({
  imageId: z.uuid(),
  productId: z.uuid(),
});

/** `variantId: null` clears the tag (photo goes back to being shared by every variant). */
export const setProductImageVariantSchema = z.object({
  imageId: z.uuid(),
  variantId: z.uuid().nullable(),
});

export type DashboardProductListParamsInput = z.input<typeof dashboardProductListParamsSchema>;
export type BulkUpdateProductStatusInput = z.infer<typeof bulkUpdateProductStatusSchema>;
export type BulkAssignProductCategoryInput = z.infer<typeof bulkAssignProductCategorySchema>;
export type BulkArchiveProductsInput = z.infer<typeof bulkArchiveProductsSchema>;
export type ProductListParamsInput = z.input<typeof productListParamsSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateProductRequestInput = z.infer<typeof createProductRequestSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AssignProductShopInput = z.infer<typeof assignProductShopSchema>;
export type UploadProductImageInput = z.infer<typeof uploadProductImageSchema>;
export type SetProductImageVariantInput = z.infer<typeof setProductImageVariantSchema>;
export type DeleteProductImageInput = z.infer<typeof deleteProductImageSchema>;
