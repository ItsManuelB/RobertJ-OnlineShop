import { z } from "zod";

/** Payload for creating a shop. `slug` is always server-derived from `name` (see `queries.createShop`). */
export const createShopSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
});

/** Payload for editing a shop's name. */
export const updateShopSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Name is required.").max(80),
});

/** Payload for toggling a shop's active status — a plain-argument action, not a form (see `toggleShopActiveAction`). */
export const toggleShopActiveSchema = z.object({
  shopId: z.uuid(),
  active: z.boolean(),
});

/** Payload for permanently deleting a shop — a plain-argument action, not a form (see `deleteShopAction`). */
export const deleteShopSchema = z.object({
  shopId: z.uuid(),
});

/** Mirrors `product.schema.ts`'s upload constants exactly — no reason for
 * shop images to be more permissive than product photos. */
const MAX_SHOP_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SHOP_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Payload for editing a seller's own shop description. Never accepts an
 * `id` — the caller's shop is always resolved server-side via
 * `requireOwnShopId()`/the `update_own_shop_name` RPC's own lookup. */
export const updateOwnShopDescriptionSchema = z.object({
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer.")
    .optional(),
});

/** Payload for a seller renaming their own shop. Mirrors the admin schema's
 * bound (and the `shops_name_length` CHECK) — never accepts an `id`; the
 * `update_own_shop_name` RPC resolves the caller's shop via `shop_users`. */
export const updateOwnShopNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
});

/** Payload for uploading a seller's own shop logo/banner. `kind` is never
 * part of this schema — it's fixed per-action (`uploadShopImageAction`'s
 * first argument), never client-submitted. */
export const uploadShopImageSchema = z.object({
  image: z
    .instanceof(File, { message: "An image is required." })
    .refine((file) => file.size > 0, "An image is required.")
    .refine(
      (file) => file.size <= MAX_SHOP_IMAGE_BYTES,
      "Image must be 5MB or smaller.",
    )
    .refine(
      (file) => ALLOWED_SHOP_IMAGE_TYPES.includes(file.type),
      "Image must be a JPEG, PNG, or WebP file.",
    ),
});

export type CreateShopInput = z.infer<typeof createShopSchema>;
export type UpdateShopInput = z.infer<typeof updateShopSchema>;
export type ToggleShopActiveInput = z.infer<typeof toggleShopActiveSchema>;
export type DeleteShopInput = z.infer<typeof deleteShopSchema>;
export type UpdateOwnShopDescriptionInput = z.infer<typeof updateOwnShopDescriptionSchema>;
export type UpdateOwnShopNameInput = z.infer<typeof updateOwnShopNameSchema>;
export type UploadShopImageInput = z.infer<typeof uploadShopImageSchema>;
