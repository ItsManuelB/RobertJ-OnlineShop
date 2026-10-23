import type { OrderStatus } from "@/constants/status";

/**
 * Badge tones used by the status/payment chips. Kept as a local union so these
 * constants stay decoupled from the `Badge` UI component (they happen to match
 * `Badge`'s `tone` variants).
 */
export type OrderStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

/**
 * Every order status, in display order. Mirrors the DB enum (single source:
 * `ORDER_STATUS` in `@/constants/status`).
 */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

/**
 * Customer-facing status labels. The capstone proposal names statuses
 * differently than the DB enum — "To Pack" = confirmed, "Ready for Pickup" =
 * processing — so the mapping is documented here instead of changing the schema.
 */
export const STATUS_LABEL_MAP: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "To Pack",
  processing: "Ready for Pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Badge tone per status — colour is always paired with the label (WCAG). */
export const STATUS_TONE_MAP: Record<OrderStatus, OrderStatusTone> = {
  pending: "info",
  confirmed: "info",
  processing: "warning",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
  refunded: "neutral",
};

/** Forward fulfilment steps rendered by the order timeline (terminal states excluded). */
export const ORDER_TIMELINE_STEPS: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
];

/** States from which a buyer may cancel their own order (DB allows any; the action enforces this). */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
];

/**
 * States in which the buyer can no longer cancel on their own but may ask the
 * seller to (preparation has started). Approval cancels the order and refunds a
 * paid one automatically; shipped orders follow the return policy instead.
 */
export const CANCELLATION_REQUEST_ORDER_STATUSES: readonly OrderStatus[] = ["processing"];

/** Non-terminal states — the order still requires seller/buyer action. Used by the admin Users list to warn before promoting a buyer with in-flight orders. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
];

/**
 * Legal next states for a seller/admin advancing (or cancelling) an order
 * from the dashboard. The DB trigger permits the seller to set `order_status`
 * to anything — this map is the actual forward-flow guard, enforced in
 * `queries.advanceOrderStatus()`. Deliberately wider than
 * `CANCELLABLE_ORDER_STATUSES`: a seller may still call off a `processing`
 * order (e.g. an item turns out to be unavailable), matching
 * `CancelOrderButton`'s existing buyer-facing copy ("once packed or shipped
 * it can no longer be cancelled" — that copy is buyer-facing only;
 * seller/admin cancellation is wider). `shipped → cancelled` covers a failed
 * delivery (refused at the door, lost in transit, returned to sender) —
 * the seller/admin marks it, `orders_restock_on_cancel` restores stock the
 * same way any other cancellation does; no separate "failed delivery"
 * status was added. `refunded` is unreachable here — it's set by
 * `decide_return`/`process_xendit_refund_webhook` on a full refund, not by
 * this dashboard control.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export function getOrderStatusLabel(status: OrderStatus): string {
  return STATUS_LABEL_MAP[status];
}

export function getOrderStatusTone(status: OrderStatus): OrderStatusTone {
  return STATUS_TONE_MAP[status];
}
