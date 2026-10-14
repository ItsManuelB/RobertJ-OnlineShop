"use server";

import { revalidatePath } from "next/cache";

import { DASHBOARD_ROLES, USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  deleteProductVariantSchema,
  productVariantSchema,
  updateProductVariantSchema,
} from "@/features/products/schemas/product-variant.schema";
import type { ProductVariant } from "@/features/products/types/product.types";

/** Same shape/role gate as `updateProductAction` — admin (owner = null) moderates any product, a seller is scoped to their own (or their shop's). */
async function resolveOwner(): Promise<{ sellerId: string; shopId: string | null } | null> {
  const user = await queries.requireRole(DASHBOARD_ROLES);
  return user.role === USER_ROLES.admin
    ? null
    : { sellerId: user.id, shopId: await queries.getOwnShopId(user.id) };
}

function revalidateVariantPaths() {
  revalidatePath(ROUTES.adminProducts);
  revalidatePath(ROUTES.sellerProducts);
  revalidatePath(ROUTES.adminInventory);
  revalidatePath(ROUTES.sellerInventory);
}

/**
 * Creates a color/size variant for a product the caller owns (or, for
 * admin, any product — moderation, not ownership). The variant's own
 * `seller_id`/`shop_id` are resolved from the *product*, never the acting
 * user, so an admin creating on a seller's behalf never attributes the
 * variant to themselves. Starts with 0 stock — see `adjustStockAction` to
 * bring it up.
 */
export async function createProductVariantAction(
  input: unknown,
): Promise<ActionResult<ProductVariant>> {
  const parsed = productVariantSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const owner = await resolveOwner();
    const product = await queries.getProductOwnerInfo(parsed.data.productId, owner);
    const variant = await queries.createProductVariant(
      parsed.data.productId,
      product.sellerId,
      product.shopId,
      {
        sku: parsed.data.sku,
        color: parsed.data.color,
        size: parsed.data.size,
        material: parsed.data.material,
        dimensions: parsed.data.dimensions,
        price: parsed.data.price,
      },
    );
    revalidateVariantPaths();
    return ok(variant);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create variant.");
  }
}

/** Updates a variant's sku/color/size/price/status. Ownership re-checked beyond RLS, same pattern as `updateProductAction`. */
export async function updateProductVariantAction(
  input: unknown,
): Promise<ActionResult<ProductVariant>> {
  const parsed = updateProductVariantSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const owner = await resolveOwner();
    const variant = await queries.updateProductVariant(parsed.data.id, owner, {
      sku: parsed.data.sku,
      color: parsed.data.color,
      size: parsed.data.size,
      material: parsed.data.material,
      dimensions: parsed.data.dimensions,
      price: parsed.data.price,
      status: parsed.data.status,
    });
    revalidateVariantPaths();
    return ok(variant);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update variant.");
  }
}

/**
 * Deletes a variant. A variant that has ever been ordered can't be deleted
 * (`order_items.variant_id` is `ON DELETE RESTRICT`) — `queries.deleteProductVariant`
 * turns that into a clear, actionable message rather than a raw DB error.
 */
export async function deleteProductVariantAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = deleteProductVariantSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const owner = await resolveOwner();
    await queries.deleteProductVariant(parsed.data.id, owner);
    revalidateVariantPaths();
    return ok(null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not delete variant.");
  }
}
