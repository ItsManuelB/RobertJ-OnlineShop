import { z } from "zod";

import { PAGINATION } from "@/constants/pagination";
import { STOCK_ADJUSTMENT_REASON } from "@/features/inventory/constants/inventory.constants";

/**
 * Only the reasons a seller/admin may pick manually — `initial_stock`,
 * `sale`, and `cancellation_restock` are system-driven only and rejected by
 * the `adjust_stock` RPC if submitted here.
 */
export const stockAdjustmentReasonSchema = z.enum([
  STOCK_ADJUSTMENT_REASON.restock,
  STOCK_ADJUSTMENT_REASON.correction,
  STOCK_ADJUSTMENT_REASON.shrinkage,
  STOCK_ADJUSTMENT_REASON.other,
]);

/** Payload for a manual stock change from the Inventory dashboard. */
export const adjustStockSchema = z
  .object({
    productId: z.uuid(),
    /** Set to adjust a specific variant's stock instead of the product's own. */
    variantId: z.uuid().optional(),
    delta: z.coerce
      .number()
      .int("Enter a whole number.")
      .refine((value) => value !== 0, "Adjustment must not be zero."),
    reason: stockAdjustmentReasonSchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => value.reason !== "other" || Boolean(value.note),
    { message: "Add a note explaining this adjustment.", path: ["note"] },
  );

/** Validates and normalises search params for the Seller/Admin dashboard inventory listing. */
export const dashboardInventoryListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.defaultPage),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxPageSize)
    .default(PAGINATION.defaultPageSize),
  search: z.string().trim().max(120).optional(),
  /** Admin-only shop filter; seller inventory remains scoped by RLS. */
  shopId: z.uuid().optional(),
  stockStatus: z.enum(["in_stock", "low_stock", "out_of_stock", "needs_attention"]).optional(),
});

/** Payload for applying one delta/reason/note to several inventory rows at once. */
export const bulkAdjustStockSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          variantId: z.uuid().optional(),
        }),
      )
      .min(1, "Select at least one row.")
      .max(100),
    delta: z.coerce
      .number()
      .int("Enter a whole number.")
      .refine((value) => value !== 0, "Adjustment must not be zero."),
    reason: stockAdjustmentReasonSchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => value.reason !== "other" || Boolean(value.note),
    { message: "Add a note explaining this adjustment.", path: ["note"] },
  );

/** Payload for moving unassigned stock into a product's options. */
export const allocateStockSchema = z.object({
  productId: z.uuid(),
  allocations: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: z.coerce.number().int("Enter a whole number.").min(1, "Enter at least 1."),
      }),
    )
    .min(1, "Enter a quantity for at least one option.")
    .max(200),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type DashboardInventoryListParamsInput = z.input<typeof dashboardInventoryListParamsSchema>;
export type BulkAdjustStockInput = z.infer<typeof bulkAdjustStockSchema>;
