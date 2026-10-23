import type { BuyerActivityEventType } from "@/features/notifications/types/notification.types";

/** Copy + icon per event type, keyed on the exact strings `get_buyer_activity_feed` returns. */
export const ACTIVITY_EVENT_COPY: Record<
  BuyerActivityEventType,
  { icon: string; label: (orderNumber: string) => string }
> = {
  order_placed: {
    icon: "🧾",
    label: (orderNumber) => `Order ${orderNumber} was placed.`,
  },
  payment_confirmed: {
    icon: "💰",
    label: (orderNumber) => `Payment confirmed for order ${orderNumber}.`,
  },
  order_shipped: {
    icon: "🚚",
    label: (orderNumber) => `Order ${orderNumber} has shipped.`,
  },
  order_delivered: {
    icon: "📦",
    label: (orderNumber) => `Order ${orderNumber} was delivered.`,
  },
  receipt_confirmed: {
    icon: "✅",
    label: (orderNumber) => `You confirmed receipt of order ${orderNumber}.`,
  },
  order_cancelled: {
    icon: "✕",
    label: (orderNumber) => `Order ${orderNumber} was cancelled.`,
  },
  receipt_submitted: {
    icon: "🧷",
    label: (orderNumber) => `Receipt submitted for order ${orderNumber} — awaiting verification.`,
  },
  payment_verified: {
    icon: "✅",
    label: (orderNumber) => `Payment verified for order ${orderNumber}.`,
  },
  payment_failed: {
    icon: "⚠️",
    label: (orderNumber) => `Payment could not be verified for order ${orderNumber}.`,
  },
  return_filed: {
    icon: "📝",
    label: (orderNumber) => `You filed a return request for order ${orderNumber}.`,
  },
  return_rejected_by_seller: {
    icon: "⚠️",
    label: (orderNumber) => `Your seller rejected the return request for order ${orderNumber}.`,
  },
  return_rejected: {
    icon: "✕",
    label: (orderNumber) => `Your return request for order ${orderNumber} was rejected.`,
  },
  return_refunded: {
    icon: "💸",
    label: (orderNumber) => `Your return for order ${orderNumber} was refunded.`,
  },
  return_replacement_approved: {
    icon: "📦",
    label: (orderNumber) => `A replacement was approved for order ${orderNumber}.`,
  },
  cancellation_requested: {
    icon: "📨",
    label: (orderNumber) => `You asked the shop to cancel order ${orderNumber}.`,
  },
  cancellation_declined: {
    icon: "⚠️",
    label: (orderNumber) => `The shop could not cancel order ${orderNumber}. It will continue as normal.`,
  },
  refund_completed: {
    icon: "💸",
    label: (orderNumber) => `Your refund for cancelled order ${orderNumber} is complete.`,
  },
  refund_needs_attention: {
    icon: "⚠️",
    label: (orderNumber) =>
      `Your refund for cancelled order ${orderNumber} needs attention. The shop has been alerted.`,
  },
};
