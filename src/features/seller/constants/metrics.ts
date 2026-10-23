/**
 * Plain-language definitions for the Seller Dashboard's sales metrics. They
 * describe what `report_sales_summary` actually calculates (see
 * `20261022170000_refund_aware_sales_reports.sql`) — change them together.
 */
export type SellerMetricKey = "gross" | "refunds" | "net" | "orders";

export interface SellerMetricDefinition {
  title: string;
  definition: string;
  counts: readonly string[];
  excludes: readonly string[];
}

export const SELLER_METRICS: Record<SellerMetricKey, SellerMetricDefinition> = {
  gross: {
    title: "Gross sales",
    definition:
      "The full value of your shop's orders placed in this period that were paid, before any refunds.",
    counts: [
      "Online orders once the payment is confirmed",
      "COD orders once you mark the cash as collected",
      "Orders that were refunded later (the refund is shown separately)",
      "Only your shop's part of a multi-shop checkout",
    ],
    excludes: [
      "Unpaid, failed or still-pending payments",
      "COD cash not yet marked as collected",
      "Other shops' items from the same checkout",
      "Replacement exchanges (never a sale)",
    ],
  },
  refunds: {
    title: "Confirmed refunds",
    definition:
      "Money returned to buyers on orders placed in this period, counted only once the refund is confirmed.",
    counts: ["Return requests with the Refunded status", "Capped at each order's total"],
    excludes: [
      "Requests still pending, accepted or waiting for the item",
      "COD refunds approved but not yet paid out",
      "Rejected or expired returns",
      "Replacement exchanges",
    ],
  },
  net: {
    title: "Net sales",
    definition:
      "What your shop kept from this period's orders: gross sales minus confirmed refunds. This is the headline number.",
    counts: ["Everything in Gross sales", "Minus every confirmed refund on those orders"],
    excludes: [
      "Refunds on orders placed in other periods. A refund lowers the period the order was placed in, not the day it was refunded.",
      "Platform fees or payouts (not part of this system)",
    ],
  },
  orders: {
    title: "Orders placed",
    definition: "Every order for your shop placed in this period, whatever its payment or fulfilment status.",
    counts: ["Unpaid and cancelled orders", "Your order from a multi-shop checkout counts once"],
    excludes: ["Other shops' orders from the same checkout", "Orders you placed yourself as a buyer"],
  },
};
