import { fromCents } from "@/lib/utils/currency";
import { PAYMENT_SOURCE_LABELS } from "@/features/payments/lib/payment-source";

import {
  DATE_PRESETS,
  DEFAULT_GRANULARITY,
  DEFAULT_REPORT_DAYS,
  REPORT_GRANULARITIES,
  type DatePresetId,
} from "../constants/report.constants";
import type {
  CategoryRevenue,
  OrderStatusCount,
  PaymentSourceSummaryRow,
  ReportFilters,
  ReportGranularity,
  SalesSummary,
  SalesTrendPoint,
  ShopSalesRow,
  TopProduct,
} from "../types/report.types";

const TIME_ZONE = "Asia/Manila";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today's calendar date in Asia/Manila as `YYYY-MM-DD`. Manila has a fixed
 * +08:00 offset (no DST), so downstream date math on the date-only string can
 * safely be done in UTC without drift.
 */
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    new Date(),
  );
}

/** Add (or subtract) whole days to a `YYYY-MM-DD` string. */
export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** First day of the given date's month, as `YYYY-MM-DD`. */
function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Monday of the given date's week (matches Postgres `date_trunc('week', …)`). */
function startOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay: 0=Sun..6=Sat → shift so Monday is the anchor.
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

/** Resolve a preset id to an inclusive `{ from, to }` range (Manila today = to). */
export function resolvePreset(id: DatePresetId): { from: string; to: string } {
  const to = manilaToday();
  if (id === "month") {
    return { from: startOfMonth(to), to };
  }
  const preset = DATE_PRESETS.find((p) => p.id === id);
  const days = preset?.days ?? DEFAULT_REPORT_DAYS;
  return { from: addDays(to, -(days - 1)), to };
}

/** The default range: the last {@link DEFAULT_REPORT_DAYS} days ending today. */
export function getDefaultRange(): { from: string; to: string } {
  const to = manilaToday();
  return { from: addDays(to, -(DEFAULT_REPORT_DAYS - 1)), to };
}

/** Whole days between two `YYYY-MM-DD` dates, inclusive-exclusive (`to` - `from`). */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * The equal-length period immediately preceding `[from, to]` — e.g. for a
 * 30-day range, the 30 days before it. Powers the Seller Dashboard/Reports'
 * period-over-period delta chips.
 */
export function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
  const days = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from: prevFrom, to: prevTo };
}

/**
 * Same `from`/`to` parsing as {@link parseReportFilters}, but defaulting to
 * today only rather than the last {@link DEFAULT_REPORT_DAYS} days — used by
 * the Dashboard Overview's lighter date filter (no granularity/shop concept
 * of its own), so its unfiltered default view is unchanged from before this
 * filter existed. Pass `fallback` for a different default (the Seller
 * Dashboard uses {@link getDefaultRange}, matching Reports).
 */
export function parseDashboardDateRange(
  params: Record<string, string | string[] | undefined>,
  fallback?: { from: string; to: string },
): { from: string; to: string } {
  const pick = (key: string): string | undefined => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const today = manilaToday();
  const rawFrom = pick("from");
  const rawTo = pick("to");

  let from = rawFrom && ISO_DATE.test(rawFrom) ? rawFrom : (fallback?.from ?? today);
  let to = rawTo && ISO_DATE.test(rawTo) ? rawTo : (fallback?.to ?? today);
  if (from > to) {
    [from, to] = [to, from];
  }
  return { from, to };
}

function isGranularity(value: unknown): value is ReportGranularity {
  return REPORT_GRANULARITIES.includes(value as ReportGranularity);
}

/**
 * Coerce raw dashboard search params into safe {@link ReportFilters}, always
 * falling back to the default range/granularity rather than throwing — a
 * malformed URL should render a sensible report, not an error page. `shopId`
 * is only retained for admins.
 */
export function parseReportFilters(
  params: Record<string, string | string[] | undefined>,
  options: { isAdmin: boolean },
): ReportFilters {
  const pick = (key: string): string | undefined => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const fallback = getDefaultRange();
  const rawFrom = pick("from");
  const rawTo = pick("to");

  let from = rawFrom && ISO_DATE.test(rawFrom) ? rawFrom : fallback.from;
  let to = rawTo && ISO_DATE.test(rawTo) ? rawTo : fallback.to;
  if (from > to) {
    [from, to] = [to, from];
  }

  const rawGranularity = pick("granularity");
  const granularity = isGranularity(rawGranularity)
    ? rawGranularity
    : DEFAULT_GRANULARITY;

  const rawShop = pick("shopId");
  const shopId = options.isAdmin && rawShop ? rawShop : null;

  return { from, to, granularity, shopId };
}

/** Enumerate every expected bucket start in `[from, to]` for a granularity. */
function expectedBuckets(
  from: string,
  to: string,
  granularity: ReportGranularity,
): string[] {
  const buckets: string[] = [];
  let cursor =
    granularity === "day"
      ? from
      : granularity === "week"
        ? startOfWeek(from)
        : startOfMonth(from);

  let guard = 0;
  while (cursor <= to && guard < 5000) {
    buckets.push(cursor);
    if (granularity === "day") {
      cursor = addDays(cursor, 1);
    } else if (granularity === "week") {
      cursor = addDays(cursor, 7);
    } else {
      const d = new Date(`${cursor}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      cursor = d.toISOString().slice(0, 10);
    }
    guard += 1;
  }
  return buckets;
}

/**
 * Fill missing buckets with zeros so the trend chart has a continuous x-axis.
 * The DB only returns non-empty buckets; this reconciles them against the
 * expected series for the selected range/granularity.
 */
export function fillTrendGaps(
  points: SalesTrendPoint[],
  filters: ReportFilters,
): SalesTrendPoint[] {
  const byBucket = new Map(points.map((p) => [p.bucket, p]));
  return expectedBuckets(filters.from, filters.to, filters.granularity).map(
    (bucket) =>
      byBucket.get(bucket) ?? { bucket, orderCount: 0, revenueCents: 0 },
  );
}

/** Short axis label for a trend bucket date, tuned to the granularity. */
export function formatBucketLabel(bucket: string, granularity: ReportGranularity): string {
  const d = new Date(`${bucket}T00:00:00Z`);
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function csvCell(value: string | number): string {
  // Free text (product and category names) must not be read as a spreadsheet formula.
  const s = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Optional sections appended to the CSV (the Seller Reports export; admin keeps the base file). */
export interface ReportCsvExtras {
  statuses?: OrderStatusCount[];
  categories?: CategoryRevenue[];
  /** Gross minus category item totals: shipping and fees, so categories add up to Gross sales. */
  categoryRemainderCents?: number;
  topProducts?: TopProduct[];
  refundsInProgress?: { count: number; cents: number };
  /** Name of the shop the figures are limited to; omitted = all shops. */
  shopName?: string;
  /** Admin only: one line per shop (plus Unassigned) so shops can be compared in the file. */
  byShop?: ShopSalesRow[];
}

/** Build a CSV export of the KPI summary plus the (gap-filled) trend series. */
export function buildReportCsv(
  filters: ReportFilters,
  summary: SalesSummary,
  trend: SalesTrendPoint[],
  paymentSources: PaymentSourceSummaryRow[],
  extras: ReportCsvExtras = {},
): string {
  const lines: string[] = [];
  lines.push(csvCell("RoberJ Sales Report"));
  lines.push([csvCell("Range"), csvCell(`${filters.from} to ${filters.to} (${TIME_ZONE})`)].join(","));
  if (extras.shopName !== undefined) {
    lines.push([csvCell("Shop"), csvCell(extras.shopName)].join(","));
  }
  lines.push("");

  if (extras.byShop) {
    lines.push(csvCell("Sales by shop (all shops, regardless of the shop filter)"));
    lines.push(
      ["Shop", "Orders", "Paid orders", "Cancelled orders", "Refunded orders", "Gross sales (PHP)", "Confirmed refunds (PHP)", "Net sales (PHP)", "Average order value (PHP)", "Units sold (paid orders)"]
        .map(csvCell)
        .join(","),
    );
    for (const row of extras.byShop) {
      lines.push([
        csvCell(row.shopName),
        csvCell(row.totalOrders),
        csvCell(row.paidOrders),
        csvCell(row.cancelledOrders),
        csvCell(row.refundedOrders),
        csvCell(fromCents(row.grossRevenueCents)),
        csvCell(fromCents(row.refundsCents)),
        csvCell(fromCents(row.revenueCents)),
        csvCell(fromCents(row.avgOrderValueCents)),
        csvCell(row.unitsSold),
      ].join(","));
    }
    lines.push([
      csvCell("All shops"),
      csvCell(extras.byShop.reduce((t, r) => t + r.totalOrders, 0)),
      csvCell(extras.byShop.reduce((t, r) => t + r.paidOrders, 0)),
      csvCell(extras.byShop.reduce((t, r) => t + r.cancelledOrders, 0)),
      csvCell(extras.byShop.reduce((t, r) => t + r.refundedOrders, 0)),
      csvCell(fromCents(extras.byShop.reduce((t, r) => t + r.grossRevenueCents, 0))),
      csvCell(fromCents(extras.byShop.reduce((t, r) => t + r.refundsCents, 0))),
      csvCell(fromCents(extras.byShop.reduce((t, r) => t + r.revenueCents, 0))),
      csvCell(""),
      csvCell(extras.byShop.reduce((t, r) => t + r.unitsSold, 0)),
    ].join(","));
    lines.push("");
  }

  lines.push(csvCell("Summary"));
  const summaryRows: Array<[string, number]> = [
    ["Total orders", summary.totalOrders],
    ["Paid orders", summary.paidOrders],
    ["Cancelled orders", summary.cancelledOrders],
    ["Gross sales (PHP)", fromCents(summary.grossRevenueCents)],
    ["Confirmed refunds (PHP)", fromCents(summary.refundsCents)],
    ["Net sales (PHP)", fromCents(summary.revenueCents)],
    ["Refunded orders", summary.refundedOrders],
    ["Units sold (paid orders)", summary.unitsSold],
    ["Average order value (PHP)", fromCents(summary.avgOrderValueCents)],
    ["COD paid orders", summary.codPaidOrders],
    ["QR paid orders (legacy)", summary.qrPaidOrders],
    ["Online payment (Xendit) paid orders", summary.xenditPaidOrders],
    ["Pending payment orders", summary.pendingPaymentOrders],
  ];
  for (const [label, value] of summaryRows) {
    lines.push([csvCell(label), csvCell(value)].join(","));
  }
  lines.push("");

  lines.push(csvCell("Paid orders by payment source"));
  lines.push(["Payment source", "Orders", "Gross paid (PHP)"].map(csvCell).join(","));
  for (const row of paymentSources) {
    lines.push([
      csvCell(PAYMENT_SOURCE_LABELS[row.source]),
      csvCell(row.orderCount),
      csvCell(fromCents(row.amountCents)),
    ].join(","));
  }
  lines.push([
    csvCell("Total paid"),
    csvCell(paymentSources.reduce((total, row) => total + row.orderCount, 0)),
    csvCell(fromCents(paymentSources.reduce((total, row) => total + row.amountCents, 0))),
  ].join(","));
  lines.push("");

  if (extras.refundsInProgress) {
    lines.push(csvCell("Refunds in progress (not yet deducted from net sales)"));
    lines.push(["Refunds", "Amount (PHP)"].map(csvCell).join(","));
    lines.push([csvCell(extras.refundsInProgress.count), csvCell(fromCents(extras.refundsInProgress.cents))].join(","));
    lines.push("");
  }

  if (extras.statuses) {
    lines.push(csvCell("Orders by status"));
    lines.push(["Status", "Orders"].map(csvCell).join(","));
    for (const row of extras.statuses) lines.push([csvCell(row.status), csvCell(row.orderCount)].join(","));
    lines.push("");
  }

  if (extras.categories) {
    lines.push(csvCell("Sales by category (paid orders, before refunds)"));
    lines.push(["Category", "Units", "Item sales (PHP)"].map(csvCell).join(","));
    for (const row of extras.categories) {
      lines.push([csvCell(row.categoryName), csvCell(row.unitsSold), csvCell(fromCents(row.revenueCents))].join(","));
    }
    if ((extras.categoryRemainderCents ?? 0) > 0) {
      lines.push([csvCell("Shipping & fees"), csvCell(""), csvCell(fromCents(extras.categoryRemainderCents ?? 0))].join(","));
    }
    lines.push("");
  }

  if (extras.topProducts) {
    lines.push(csvCell("Top products (paid orders, before refunds)"));
    lines.push(["Product", "Units", "Sales (PHP)"].map(csvCell).join(","));
    for (const row of extras.topProducts) {
      lines.push([csvCell(row.productTitle), csvCell(row.unitsSold), csvCell(fromCents(row.revenueCents))].join(","));
    }
    lines.push("");
  }

  lines.push(csvCell("Sales over time"));
  lines.push(["Bucket", "Orders", "Net sales (PHP)"].map(csvCell).join(","));
  for (const point of trend) {
    lines.push(
      [
        csvCell(point.bucket),
        csvCell(point.orderCount),
        csvCell(fromCents(point.revenueCents)),
      ].join(","),
    );
  }

  return lines.join("\n");
}
