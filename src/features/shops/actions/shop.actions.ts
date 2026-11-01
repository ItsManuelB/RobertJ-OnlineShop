"use server";

import { revalidatePath } from "next/cache";

import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  createShopSchema,
  deleteShopSchema,
  toggleShopActiveSchema,
  updateOwnShopDescriptionSchema,
  updateOwnShopNameSchema,
  updateShopSchema,
  uploadShopImageSchema,
} from "@/features/shops/schemas/shop.schema";
import type { Shop } from "@/features/shops/types/shop.types";

/** Admin-only: creates a shop. */
export async function createShopAction(
  _prevState: ActionResult<Shop> | null,
  formData: FormData,
): Promise<ActionResult<Shop>> {
  const parsed = createShopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const shop = await queries.createShop(parsed.data);
    revalidatePath(ROUTES.adminShops);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.sellerProducts);
    revalidatePath(ROUTES.sellerInventory);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create the shop.");
  }
}

/** Admin-only: edits a shop's name. */
export async function updateShopAction(
  _prevState: ActionResult<Shop> | null,
  formData: FormData,
): Promise<ActionResult<Shop>> {
  const parsed = updateShopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const shop = await queries.updateShop(parsed.data);
    revalidatePath(ROUTES.adminShops);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the shop.");
  }
}

/** Admin-only: toggles a shop's active status. */
export async function toggleShopActiveAction(
  shopId: string,
  active: boolean,
): Promise<ActionResult<Shop>> {
  const parsed = toggleShopActiveSchema.safeParse({ shopId, active });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const shop = await queries.updateShop({ id: parsed.data.shopId, active: parsed.data.active });
    revalidatePath(ROUTES.adminShops);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the shop.");
  }
}

/**
 * Admin-only: permanently deletes a shop. The shop must already be
 * deactivated, have no current member, and have no historical order/return/
 * shipment — `queries.hardDeleteShop` (via `admin_hard_delete_shop`) enforces
 * all of this and returns a curated error naming the exact blocker when it
 * doesn't hold. Its products/inventory/etc. are detached (shop_id set null),
 * never deleted.
 */
export async function deleteShopAction(shopId: string): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteShopSchema.safeParse({ shopId });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    await queries.hardDeleteShop(parsed.data.shopId);
    revalidatePath(ROUTES.adminShops);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.sellerProducts);
    revalidatePath(ROUTES.sellerInventory);
    return ok({ id: parsed.data.shopId });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not delete the shop.");
  }
}

/**
 * Seller-only: edits the caller's own shop's description. Never accepts an
 * `id`/shop id from the form — `requireOwnShopId()` resolves it server-side —
 * and never touches `name`/`active`/`slug`/image columns.
 */
export async function updateOwnShopDescriptionAction(
  _prevState: ActionResult<Shop> | null,
  formData: FormData,
): Promise<ActionResult<Shop>> {
  const parsed = updateOwnShopDescriptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.seller]);
    const shopId = await queries.requireOwnShopId();
    const shop = await queries.updateOwnShopDescription(shopId, parsed.data.description ?? null);
    revalidatePath(ROUTES.sellerShop);
    revalidatePath(ROUTES.products);
    revalidatePath(ROUTES.home);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update your shop.");
  }
}

/**
 * Seller-only: renames the caller's own shop. Any member of the shop may do
 * this (the same tier `updateOwnShopDescriptionAction` already uses) — never
 * accepts a shop id from the form; `update_own_shop_name` resolves the
 * caller's shop itself.
 */
export async function updateOwnShopNameAction(
  _prevState: ActionResult<Shop> | null,
  formData: FormData,
): Promise<ActionResult<Shop>> {
  const parsed = updateOwnShopNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.seller]);
    const shop = await queries.updateOwnShopName(parsed.data.name);
    revalidatePath(ROUTES.sellerShop);
    revalidatePath(ROUTES.products);
    revalidatePath(ROUTES.home);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not rename your shop.");
  }
}

/**
 * Seller-only: uploads (or replaces) the caller's own shop's logo/banner.
 * `kind` is a fixed argument the client binds per-uploader, never a form
 * field; `shopId` always comes from `requireOwnShopId()`, never the client.
 */
export async function uploadShopImageAction(
  kind: "logo" | "banner",
  formData: FormData,
): Promise<ActionResult<Shop>> {
  const parsed = uploadShopImageSchema.safeParse({ image: formData.get("image") });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.seller]);
    const shopId = await queries.requireOwnShopId();
    const shop = await queries.replaceShopImage(shopId, kind, parsed.data.image);
    revalidatePath(ROUTES.sellerShop);
    revalidatePath(ROUTES.products);
    revalidatePath(ROUTES.home);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not upload the image.");
  }
}

/** Seller-only: removes the caller's own shop's logo/banner. */
export async function removeShopImageAction(
  kind: "logo" | "banner",
): Promise<ActionResult<Shop>> {
  try {
    await queries.requireRole([USER_ROLES.seller]);
    const shopId = await queries.requireOwnShopId();
    const shop = await queries.removeShopImage(shopId, kind);
    revalidatePath(ROUTES.sellerShop);
    revalidatePath(ROUTES.products);
    revalidatePath(ROUTES.home);
    return ok(shop);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not remove the image.");
  }
}
