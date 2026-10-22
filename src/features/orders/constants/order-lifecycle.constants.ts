/**
 * The buyer-facing `/orders` lifecycle tabs (Shopee-style: All, To Pay, To
 * Ship, To Receive, Completed, Cancelled, Return/Refund). The mapping from
 * an order's `order_status`/`payment_status`/payment-method/return-request
 * state to one of these tabs is computed entirely by the `buyer_order_lifecycle`
 * SQL view (see `supabase/migrations/20260923000000_buyer_order_lifecycle_view.sql`)
 * — this file only names the tabs for the UI and query params. Do not
 * reimplement the precedence logic here or in any component; always read it
 * from the view.
 */
export type LifecycleTab =
  | "to_pay"
  | "to_ship"
  | "to_receive"
  | "completed"
  | "cancelled"
  | "return_refund";

/** Every lifecycle tab except "All" (which is just "no filter"), in display order. */
export const ORDER_LIFECYCLE_TABS: readonly LifecycleTab[] = [
  "to_pay",
  "to_ship",
  "to_receive",
  "completed",
  "cancelled",
  "return_refund",
];

export const LIFECYCLE_TAB_LABELS: Record<LifecycleTab, string> = {
  to_pay: "To Pay",
  to_ship: "To Ship",
  to_receive: "To Receive",
  completed: "Completed",
  cancelled: "Cancelled",
  return_refund: "Return/Refund",
};

/** Type guard for the `tab` search param — an unrecognized value is treated as "All". */
export function isLifecycleTab(value: string | null | undefined): value is LifecycleTab {
  return (ORDER_LIFECYCLE_TABS as readonly string[]).includes(value ?? "");
}

/** How long an unpaid online-payment order is held before it is cancelled and its stock released. Mirrors `expire_unpaid_xendit_order` and the sweep route; shown to buyers only. */
export const UNPAID_ORDER_EXPIRY_MINUTES = 60;
