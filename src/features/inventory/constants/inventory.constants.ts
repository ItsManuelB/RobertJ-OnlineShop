import type { Enums } from "@/lib/supabase/database.types";
import type { StockStatus } from "@/features/inventory/types/inventory.types";

/** Derived from the database enum, not redeclared — see constants/status.ts for the same convention. */
export type StockAdjustmentReason = Enums<"stock_adjustment_reason">;

export const STOCK_ADJUSTMENT_REASON = {
  initialStock: "initial_stock",
  restock: "restock",
  correction: "correction",
  sale: "sale",
  cancellationRestock: "cancellation_restock",
  returnRestock: "return_restock",
  replacementShipment: "replacement_shipment",
  shrinkage: "shrinkage",
  other: "other",
} as const satisfies Record<string, StockAdjustmentReason>;

export const STOCK_ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  initial_stock: "Initial stock",
  restock: "Restock",
  correction: "Correction",
  sale: "Sale",
  cancellation_restock: "Order cancelled",
  return_restock: "Return confirmed sellable",
  replacement_shipment: "Replacement shipped",
  shrinkage: "Shrinkage",
  other: "Other",
};

/**
 * Reasons a seller/admin may pick when manually adjusting stock from the
 * dashboard. `initial_stock`, `sale`, `cancellation_restock`, and
 * `return_restock`/`replacement_shipment` are system-driven only — `adjust_stock` rejects them if
 * submitted manually.
 */
export const MANUAL_STOCK_ADJUSTMENT_REASONS: readonly StockAdjustmentReason[] = [
  STOCK_ADJUSTMENT_REASON.restock,
  STOCK_ADJUSTMENT_REASON.correction,
  STOCK_ADJUSTMENT_REASON.shrinkage,
  STOCK_ADJUSTMENT_REASON.other,
];

/** Matches inventory.low_stock_threshold's DB default and ProductTile's prior hardcoded value. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Badge tones for the stock status chip — mirrors `PRODUCT_STATUS_TONE_MAP`'s exact pattern. */
export type StockStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

export const STOCK_STATUS_TONE_MAP: Record<StockStatus, StockStatusTone> = {
  in_stock: "success",
  low_stock: "warning",
  out_of_stock: "danger",
};

export function getStockStatusTone(status: StockStatus): StockStatusTone {
  return STOCK_STATUS_TONE_MAP[status];
}
