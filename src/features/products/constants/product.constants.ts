import type { ProductStatus } from "@/constants/status";

/**
 * Badge tones for the product status chip, kept as a local union so these
 * constants stay decoupled from the `Badge` UI component (mirrors
 * `features/orders/constants/order.constants.ts`'s exact pattern).
 */
export type ProductStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const PRODUCT_STATUS_TONE_MAP: Record<ProductStatus, ProductStatusTone> = {
  draft: "neutral",
  active: "success",
  sold: "warning",
  archived: "neutral",
};

export function getProductStatusTone(status: ProductStatus): ProductStatusTone {
  return PRODUCT_STATUS_TONE_MAP[status];
}

/**
 * Buyer-facing scarcity copy switches to "Only N left" at or below this
 * quantity. This is presentation policy and intentionally separate from the
 * editable inventory restock thresholds.
 */
export const LOW_STOCK_THRESHOLD = 5;
