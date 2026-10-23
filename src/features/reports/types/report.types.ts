import type { OrderStatus } from "@/constants/status";
import type { StockStatus } from "@/features/inventory";
import type { PaymentSourceKey } from "@/features/payments/lib/payment-source";

/** Time bucket granularity for the sales trend. Mirrors the RPC's accepted values. */
export type ReportGranularity = "day" | "week" | "month";

/**
 * The report query, as resolved from the dashboard's search params. Dates are
 * `YYYY-MM-DD` calendar dates interpreted in Asia/Manila (the single reporting
 * axis — see the migration header). `shopId` is honoured only for admins; the
 * RPC ignores it for sellers.
 */
export interface ReportFilters {
  from: string;
  to: string;
  granularity: ReportGranularity;
  shopId: string | null;
}

/** One-row KPI summary. All monetary values are integer centavos. */
export interface SalesSummary {
  totalOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  /** NET revenue: gross paid-order totals minus confirmed refunds on those orders. */
  revenueCents: number;
  /** Totals of orders that were ever paid (paid, partially refunded or refunded). */
  grossRevenueCents: number;
  /** Confirmed refunds on those orders; the original orders and payments are never altered. */
  refundsCents: number;
  refundedOrders: number;
  unitsSold: number;
  avgOrderValueCents: number;
  codPaidOrders: number;
  qrPaidOrders: number;
  xenditPaidOrders: number;
  pendingPaymentOrders: number;
}

/** Paid orders grouped by the source staff recognize in Finance. Amounts are gross order values in centavos. */
export interface PaymentSourceSummaryRow {
  source: PaymentSourceKey;
  orderCount: number;
  amountCents: number;
}

/** A single point on the sales trend. `bucket` is a `YYYY-MM-DD` Manila date. */
export interface SalesTrendPoint {
  bucket: string;
  orderCount: number;
  revenueCents: number;
}

/** Count of orders in a given fulfilment status within the range. */
export interface OrderStatusCount {
  status: OrderStatus;
  orderCount: number;
}

/** A best-selling product row (units across placed orders; revenue over paid). */
export interface TopProduct {
  productId: string;
  productTitle: string;
  unitsSold: number;
  revenueCents: number;
}

/**
 * One low/out-of-stock inventory row cross-referenced with its sales in the
 * report range — "your best-seller is about to run out" — Seller Dashboard/
 * Reports only. Ranked by `revenueCentsInRange` (paid orders), same
 * "revenue over paid" convention as {@link TopProduct}; `unitsSoldInRange`
 * counts across all placed orders, matching it too.
 */
export interface RestockPriorityItem {
  productId: string;
  variantId: string | null;
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  stockStatus: StockStatus;
  unitsSoldInRange: number;
  revenueCentsInRange: number;
}

/** Revenue/units rollup per category within the range (paid orders only). Seller Reports only. */
export interface CategoryRevenue {
  categoryId: string | null;
  categoryName: string;
  revenueCents: number;
  unitsSold: number;
}

/**
 * Returning- vs. new-buyer split for the range — a buyer counts as
 * "returning" if they have more than one order with this seller across all
 * time, not just within the range. Seller Dashboard only.
 */
export interface RepeatCustomerStats {
  totalOrders: number;
  returningOrders: number;
  newOrders: number;
  ratePercent: number;
}
