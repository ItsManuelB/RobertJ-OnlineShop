/** Every event type `get_buyer_activity_feed` can return. Deliberately does
 * NOT include "confirmed"/"processing" — `orders` has no timestamp column
 * for those transitions (see the RPC's migration). */
export type BuyerActivityEventType =
  | "order_placed"
  | "payment_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "receipt_confirmed"
  | "order_cancelled"
  | "receipt_submitted"
  | "payment_verified"
  | "payment_failed"
  | "return_filed"
  | "return_rejected_by_seller"
  | "return_rejected"
  | "return_refunded"
  | "return_replacement_approved"
  | "cancellation_requested"
  | "cancellation_declined"
  | "refund_completed"
  | "refund_needs_attention";

/** One row of the derived, read-only buyer activity feed. */
export interface BuyerActivityEvent {
  eventType: BuyerActivityEventType;
  orderId: string;
  orderNumber: string;
  occurredAt: string;
}
