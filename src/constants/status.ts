import type { Enums } from "@/lib/supabase/database.types";

/**
 * These unions are derived from the database enums, not redeclared. If a value
 * is added in a migration and the types are regenerated, anything that fails to
 * handle it stops compiling.
 */
export type ProductStatus = Enums<"product_status">;
export type ProductCondition = Enums<"product_condition">;
export type PaymentStatus = Enums<"payment_status">;
export type OrderStatus = Enums<"order_status">;
export type ReturnStatus = Enums<"return_status">;

export const PRODUCT_STATUS = {
  draft: "draft",
  active: "active",
  sold: "sold",
  archived: "archived",
} as const satisfies Record<string, ProductStatus>;

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  sold: "Sold out",
  archived: "Archived",
};

export const PRODUCT_CONDITION = {
  new: "new",
  likeNew: "like_new",
  good: "good",
  fair: "fair",
  poor: "poor",
} as const satisfies Record<string, ProductCondition>;

export const PRODUCT_CONDITION_LABELS: Record<ProductCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

/** Payment lifecycle. Driven by the payment provider, never by the client. */
export const PAYMENT_STATUS = {
  pending: "pending",
  paid: "paid",
  failed: "failed",
  refunded: "refunded",
  partiallyRefunded: "partially_refunded",
} as const satisfies Record<string, PaymentStatus>;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

/** Fulfilment lifecycle. Advanced by the seller. */
export const ORDER_STATUS = {
  pending: "pending",
  confirmed: "confirmed",
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "refunded",
} as const satisfies Record<string, OrderStatus>;

/**
 * Return/refund lifecycle. See `decide_return`'s doc comment
 * (`supabase/migrations/20260826000000_returns_and_refunds.sql`) for the
 * full state machine — there is no separate "admin approved" state:
 * approval and the refund itself are one atomic transition to `refunded`.
 */
export const RETURN_STATUS = {
  pending: "pending",
  sellerAccepted: "seller_accepted",
  sellerRejected: "seller_rejected",
  adminRejected: "admin_rejected",
  refunded: "refunded",
  /** Admin approved a `replacement_exchange` resolution — no payment/order_status change; see `record_return_replacement_shipment`. */
  replacementApproved: "replacement_approved",
  /** The seller shipped the replacement (stock deducted); the buyer confirms receipt, or it auto-completes 7 days later. */
  replacementShipped: "replacement_shipped",
  /** The buyer confirmed the replacement (or it auto-completed). Replacements are never sales. */
  replacementCompleted: "replacement_completed",
  /** COD refund approved by admin; nothing is marked refunded until `record_cod_refund_payout` records the real payout. */
  refundDue: "refund_due",
  /** Admin approved a Return and Refund: the buyer must ship the item back by `returnDeadlineAt`. */
  awaitingReturn: "awaiting_return",
  /** Buyer entered courier + tracking for the parcel going back. */
  returnShipped: "return_shipped",
  /** Seller confirmed receipt and inspected the item; waiting for the admin to confirm the refund. */
  returnReceived: "return_received",
  /** The buyer did not ship in time; nothing was refunded. */
  returnExpired: "return_expired",
} as const satisfies Record<string, ReturnStatus>;

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  pending: "Pending",
  seller_accepted: "Accepted by seller",
  seller_rejected: "Rejected by seller",
  admin_rejected: "Rejected",
  refunded: "Refunded",
  replacement_approved: "Replacement approved",
  replacement_shipped: "Replacement shipped",
  replacement_completed: "Replacement completed",
  refund_due: "Refund approved — payout pending",
  awaiting_return: "Awaiting return",
  return_shipped: "Return shipped",
  return_received: "Return received",
  return_expired: "Return expired",
};
