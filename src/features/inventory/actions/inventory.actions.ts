"use server";

import { revalidatePath } from "next/cache";

import { DASHBOARD_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  adjustStockSchema,
  allocateStockSchema,
  bulkAdjustStockSchema,
  bulkUpdateInventoryThresholdSchema,
  startingStockSchema,
  updateInventoryThresholdSchema,
} from "@/features/inventory/schemas/inventory.schema";
import type {
  InventoryItem,
  StockAdjustment,
} from "@/features/inventory/types/inventory.types";

/** Manual stock change (restock/correction/shrinkage/other) from the Inventory dashboard. */
export async function adjustStockAction(
  _prevState: ActionResult<InventoryItem> | null,
  formData: FormData,
): Promise<ActionResult<InventoryItem>> {
  const parsed = adjustStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`adjustStock:${user.id}`, 30, 60);
    const item = await queries.adjustStock(parsed.data);
    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.sellerProducts);
    return ok(item);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not adjust stock.");
  }
}

/** Seller override for one inventory row; a blank value restores the admin default. */
export async function updateInventoryThresholdAction(
  _prevState: ActionResult<InventoryItem> | null,
  formData: FormData,
): Promise<ActionResult<InventoryItem>> {
  const parsed = updateInventoryThresholdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`updateInventoryThreshold:${user.id}`, 30, 60);
    const item = await queries.updateInventoryLowStockThreshold({
      productId: parsed.data.productId,
      variantId: parsed.data.variantId ?? null,
      threshold: parsed.data.threshold === "" ? null : parsed.data.threshold,
    });
    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.sellerProducts);
    revalidatePath(ROUTES.adminReports);
    revalidatePath(ROUTES.sellerReports);
    revalidatePath(ROUTES.adminDashboard);
    revalidatePath(ROUTES.sellerDashboard);
    revalidatePath(ROUTES.admin, "layout");
    revalidatePath(ROUTES.seller, "layout");
    return ok(item);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save the threshold.");
  }
}

/**
 * Applies one delta/reason/note to several inventory rows at once. Each row
 * still goes through the same `adjust_stock` RPC as the single-row form (via
 * `queries.adjustStock`), one call per row — the RPC computes each row's own
 * previous/new quantity and appends its own history entry, so this can't
 * collapse into a single bulk UPDATE without losing that per-row bookkeeping.
 * Partial failure is expected (e.g. one row can't go negative) and reported
 * back rather than aborting the rest.
 */
export async function bulkAdjustStockAction(
  items: Array<{ productId: string; variantId?: string | null }>,
  delta: number,
  reason: string,
  note?: string,
): Promise<ActionResult<{ updated: number; failed: Array<{ productId: string; error: string }> }>> {
  const parsed = bulkAdjustStockSchema.safeParse({
    items: items.map((item) => ({ productId: item.productId, variantId: item.variantId ?? undefined })),
    delta,
    reason,
    note,
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkAdjustStock:${user.id}`, 10, 60);

    const failed: Array<{ productId: string; error: string }> = [];
    let updated = 0;
    for (const item of parsed.data.items) {
      try {
        await queries.adjustStock({
          productId: item.productId,
          variantId: item.variantId,
          delta: parsed.data.delta,
          reason: parsed.data.reason,
          note: parsed.data.note,
        });
        updated += 1;
      } catch (error) {
        failed.push({
          productId: item.productId,
          error: error instanceof Error ? error.message : "Could not adjust stock.",
        });
      }
    }

    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.sellerProducts);
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not adjust stock.");
  }
}

/** Applies one threshold to the selected rows; null restores each row's inherited admin default. */
export async function bulkUpdateInventoryThresholdAction(
  items: Array<{ productId: string; variantId?: string | null }>,
  threshold: number | null,
): Promise<ActionResult<{ updated: number; failed: Array<{ productId: string; error: string }> }>> {
  const parsed = bulkUpdateInventoryThresholdSchema.safeParse({ items, threshold });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`bulkUpdateInventoryThreshold:${user.id}`, 10, 60);

    const failed: Array<{ productId: string; error: string }> = [];
    let updated = 0;
    for (const item of parsed.data.items) {
      try {
        await queries.setInventoryLowStockThreshold({
          productId: item.productId,
          variantId: item.variantId ?? null,
          threshold: parsed.data.threshold,
        });
        updated += 1;
      } catch (error) {
        failed.push({
          productId: item.productId,
          error: error instanceof Error ? error.message : "Could not save the threshold.",
        });
      }
    }

    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.sellerProducts);
    revalidatePath(ROUTES.adminReports);
    revalidatePath(ROUTES.sellerReports);
    revalidatePath(ROUTES.adminDashboard);
    revalidatePath(ROUTES.sellerDashboard);
    revalidatePath(ROUTES.admin, "layout");
    revalidatePath(ROUTES.seller, "layout");
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save the thresholds.");
  }
}

/** One option of a product, as the "move stock into options" form lists it. */
export interface ProductOptionStock {
  variantId: string;
  label: string;
  quantity: number;
}

/** A product's options with their current stock — for the move-stock form. */
export async function getProductOptionsAction(
  productId: string,
): Promise<ActionResult<ProductOptionStock[]>> {
  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const variants = await queries.listProductVariants(productId);
    const options = await Promise.all(
      variants.map(async (variant) => ({
        variantId: variant.id,
        label: [variant.color, variant.size, variant.material, variant.dimensions]
          .filter(Boolean)
          .join(" / "),
        quantity: (await queries.getVariantInventory(variant.id))?.quantity ?? 0,
      })),
    );
    return ok(options);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load the options.");
  }
}

/**
 * Sets the opening count of options that were just created at 0 stock. Each
 * entry is a "restock" of that option through the same `adjust_stock` RPC as
 * any manual change (so it is logged and ownership-checked); per-option
 * failures are reported without aborting the rest.
 */
export async function setStartingStockAction(
  input: unknown,
): Promise<ActionResult<{ updated: number; failed: Array<{ variantId: string; error: string }> }>> {
  const parsed = startingStockSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`startingStock:${user.id}`, 20, 60);

    const failed: Array<{ variantId: string; error: string }> = [];
    let updated = 0;
    for (const entry of parsed.data.entries) {
      try {
        await queries.adjustStock({
          productId: parsed.data.productId,
          variantId: entry.variantId,
          delta: entry.quantity,
          reason: "restock",
          note: "Opening count for a new option",
        });
        updated += 1;
      } catch (error) {
        failed.push({
          variantId: entry.variantId,
          error: error instanceof Error ? error.message : "Could not set stock.",
        });
      }
    }

    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.sellerProducts);
    return ok({ updated, failed });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not set stock.");
  }
}

/**
 * Moves unassigned stock into the product's options. Total stock is
 * preserved: the RPC takes exactly what it adds to the options from the
 * product-level row, in one transaction.
 */
export async function allocateStockToOptionsAction(
  input: unknown,
): Promise<ActionResult<{ moved: number }>> {
  const parsed = allocateStockSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole(DASHBOARD_ROLES);
    await queries.requireRateLimit(`allocateStock:${user.id}`, 20, 60);
    const moved = await queries.allocateStockToVariants(
      parsed.data.productId,
      parsed.data.allocations,
    );
    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.adminProducts);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.sellerProducts);
    return ok({ moved });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not move the stock.");
  }
}

/**
 * Recent stock movement history for one product (or one of its variants) —
 * powers the row's expandable history panel. Omitting `variantId` scopes to
 * the product-level row's own history only, never a mix with its variants'.
 */
export async function getStockHistoryAction(
  productId: string,
  variantId?: string | null,
): Promise<ActionResult<StockAdjustment[]>> {
  try {
    await queries.requireRole(DASHBOARD_ROLES);
    const history = await queries.listStockAdjustments(productId, variantId);
    return ok(history);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not load stock history.",
    );
  }
}
