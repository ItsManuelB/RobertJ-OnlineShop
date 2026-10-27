import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import { PrintLabelButton } from "@/features/orders/components/PrintLabelButton";
import { getOrderStatusLabel } from "@/features/orders/constants/order.constants";
import { PAYMENT_SOURCE_LABELS } from "@/features/payments/lib/payment-source";
import { REPORT_GRANULARITIES, TOP_PRODUCTS_LIMIT } from "@/features/reports/constants/report.constants";
import type { ReportGranularity } from "@/features/reports/types/report.types";
import { fillTrendGaps, getPreviousPeriod, parseReportFilters } from "@/features/reports/utils/report-range";
import { pickGranularity } from "@/features/seller/components/SellerSalesTrend";
import {
  getCurrentSellerOwner,
  getOrderStatusBreakdown,
  getPaymentSourceSummary,
  getRefundPipeline,
  getRestockPriorityReport,
  getRevenueByCategory,
  getShopById,
  getSalesSummary,
  getSalesTimeseries,
  getTopProducts,
  requireSessionUser,
} from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/utils/currency";


const TH = "border-b border-border py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const TD = "border-b border-border py-1.5 tabular-nums";
const RIGHT = "text-right";

/** One failed read leaves its section with a note instead of failing the whole document. */
async function settle<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    return null;
  }
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function change(current: number, before: number | undefined): string {
  if (before === undefined) return "";
  if (before === 0) return current === 0 ? "No change" : "New this period";
  const pct = ((current - before) / before) * 100;
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% vs previous`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Unavailable() {
  return <p className="text-xs text-muted-foreground">This section could not be loaded. Print again to retry.</p>;
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export interface SellerReportPrintViewProps {
  params: Record<string, string | string[] | undefined>;
  audience: "seller" | "admin";
}

/**
 * Printable sales report (Seller and Admin portals share it): plain HTML printed with `window.print()` (choose
 * "Save as PDF" in the print dialog), the same no-library approach as the
 * shipping label and buyer receipt. It reads what the Reports page reads,
 * scoped to the signed-in seller's shop (or, for an admin, the marketplace or the
 * one shop picked in the filter), so the printout and the screen agree.
 * `data-print-root` isolates it from the portal chrome when printing.
 */
export async function SellerReportPrintView({ params, audience }: SellerReportPrintViewProps) {
  const isAdmin = audience === "admin";
  const [sellerOwner, user] = await Promise.all([isAdmin ? null : getCurrentSellerOwner(), requireSessionUser()]);
  const parsed = parseReportFilters(params, { isAdmin });
  // Admin: the filter's shop (null = every shop). Seller: their own shop, which the RPCs enforce anyway.
  const shopId = isAdmin ? parsed.shopId : (sellerOwner?.shopId ?? null);
  const owner = isAdmin ? (shopId ? { sellerId: "", shopId } : null) : sellerOwner;
  const shopLabel = !isAdmin
    ? ""
    : shopId
      ? ((await settle(getShopById(shopId)))?.name ?? "One shop")
      : "All shops";
  const reportsRoute = isAdmin ? ROUTES.adminReports : ROUTES.sellerReports;
  const { from, to } = parsed;
  const rawInterval = Array.isArray(params.interval) ? params.interval[0] : params.interval;
  const granularity: ReportGranularity = REPORT_GRANULARITIES.includes(rawInterval as ReportGranularity)
    ? (rawInterval as ReportGranularity)
    : pickGranularity(from, to);
  const filters = { ...parsed, granularity };
  const previous = getPreviousPeriod(from, to);
  const backHref = `${reportsRoute}?from=${from}&to=${to}`;

  if (!isAdmin && !shopId) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">Your account isn&apos;t linked to a shop yet, so there is nothing to print.</p>
        <Link href={reportsRoute} className="text-sm font-semibold text-primary underline">
          Back to reports
        </Link>
      </div>
    );
  }

  const [summary, prior, pipeline, series, sources, statuses, categories, topProducts, restock] = await Promise.all([
    settle(getSalesSummary(from, to, shopId)),
    settle(getSalesSummary(previous.from, previous.to, shopId)),
    settle(getRefundPipeline({ from, to }, shopId)),
    settle(getSalesTimeseries(from, to, granularity, shopId)),
    settle(getPaymentSourceSummary(from, to, shopId)),
    settle(getOrderStatusBreakdown(from, to, shopId)),
    settle(getRevenueByCategory(from, to, shopId)),
    settle(getTopProducts(from, to, TOP_PRODUCTS_LIMIT, shopId)),
    settle(getRestockPriorityReport(from, to, 5, owner)),
  ]);

  const trend = series ? fillTrendGaps(series, filters) : null;
  const categoryItems = categories ? categories.reduce((sum, row) => sum + row.revenueCents, 0) : 0;
  const intervalWord = granularity === "day" ? "daily" : granularity === "week" ? "weekly" : "monthly";

  return (
    <div className="flex flex-col items-center gap-4 p-5">
      <div className="no-print flex w-full max-w-[820px] items-center justify-between gap-3">
        <Link href={backHref} className="text-sm font-semibold text-primary hover:underline">
          ← Back to reports
        </Link>
        <PrintLabelButton label="Print / Save as PDF" />
      </div>

      <div
        data-print-root
        className="w-full max-w-[820px] rounded-xl border border-border bg-card p-8 text-sm text-foreground print:border-0 print:p-0"
      >
        <header className="mb-5 flex flex-col gap-1 border-b border-border pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {isAdmin ? "RobertJ Admin Portal" : "RobertJ Seller Portal"}
          </p>
          <h1 className="text-xl font-semibold">Sales report</h1>
          <p className="text-xs text-muted-foreground">
            Orders placed {longDate(from)} – {longDate(to)} (Asia/Manila days) · compared with {longDate(previous.from)} –{" "}
            {longDate(previous.to)}
          </p>
          <p className="text-xs text-muted-foreground">
            Prepared for {user.fullName ?? (isAdmin ? "the marketplace" : "your shop")}{isAdmin ? ` · ${shopLabel}` : ""} · generated {new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <Section title="Sales overview">
            {summary ? (
              <>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Measure</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>This period</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={TD}>Gross sales</td>
                      <td className={`${TD} ${RIGHT}`}>{formatCurrency(summary.grossRevenueCents)}</td>
                      <td className={`${TD} ${RIGHT} text-muted-foreground`}>{change(summary.grossRevenueCents, prior?.grossRevenueCents)}</td>
                    </tr>
                    <tr>
                      <td className={TD}>Confirmed refunds</td>
                      <td className={`${TD} ${RIGHT}`}>
                        {summary.refundsCents > 0 ? "−" : ""}
                        {formatCurrency(summary.refundsCents)}
                      </td>
                      <td className={`${TD} ${RIGHT} text-muted-foreground`}>{change(summary.refundsCents, prior?.refundsCents)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className={TD}>Net sales</td>
                      <td className={`${TD} ${RIGHT}`}>{formatCurrency(summary.revenueCents)}</td>
                      <td className={`${TD} ${RIGHT} font-normal text-muted-foreground`}>{change(summary.revenueCents, prior?.revenueCents)}</td>
                    </tr>
                    <tr>
                      <td className={TD}>Orders placed</td>
                      <td className={`${TD} ${RIGHT}`}>{summary.totalOrders}</td>
                      <td className={`${TD} ${RIGHT} text-muted-foreground`}>{change(summary.totalOrders, prior?.totalOrders)}</td>
                    </tr>
                    <tr>
                      <td className={TD}>Paid orders</td>
                      <td className={`${TD} ${RIGHT}`}>{summary.paidOrders}</td>
                      <td className={TD} />
                    </tr>
                    <tr>
                      <td className={TD}>Average order value</td>
                      <td className={`${TD} ${RIGHT}`}>{formatCurrency(summary.avgOrderValueCents)}</td>
                      <td className={TD} />
                    </tr>
                    <tr>
                      <td className={TD}>Units sold (paid orders)</td>
                      <td className={`${TD} ${RIGHT}`}>{summary.unitsSold}</td>
                      <td className={TD} />
                    </tr>
                    <tr>
                      <td className={TD}>Awaiting payment</td>
                      <td className={`${TD} ${RIGHT}`}>{summary.pendingPaymentOrders}</td>
                      <td className={TD} />
                    </tr>
                    <tr>
                      <td className={TD}>Cancelled</td>
                      <td className={`${TD} ${RIGHT}`}>{summary.cancelledOrders}</td>
                      <td className={TD} />
                    </tr>
                    {pipeline ? (
                      <tr>
                        <td className={TD}>Refunds in progress (not yet in net sales)</td>
                        <td className={`${TD} ${RIGHT}`}>
                          {formatCurrency(pipeline.pendingCents + pipeline.attentionCents)} · {pipeline.pendingCount + pipeline.attentionCount}
                        </td>
                        <td className={TD} />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Net sales = gross sales minus confirmed refunds. Orders count on the day they were placed.
                </p>
              </>
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title={`Sales over time (${intervalWord})`}>
            {trend ? (
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>{granularity === "week" ? "Week of" : granularity === "month" ? "Month" : "Day"}</th>
                    <th scope="col" className={`${TH} ${RIGHT}`}>Orders</th>
                    <th scope="col" className={`${TH} ${RIGHT}`}>Net sales</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((point) => (
                    <tr key={point.bucket}>
                      <td className={TD}>{point.bucket}</td>
                      <td className={`${TD} ${RIGHT}`}>{point.orderCount}</td>
                      <td className={`${TD} ${RIGHT}`}>{formatCurrency(point.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Payment source (gross paid)">
            {sources ? (
              <table className="w-full">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Source</th>
                    <th scope="col" className={`${TH} ${RIGHT}`}>Orders</th>
                    <th scope="col" className={`${TH} ${RIGHT}`}>Gross paid</th>
                  </tr>
                </thead>
                <tbody>
                  {sources
                    .filter((row) => row.orderCount > 0)
                    .map((row) => (
                      <tr key={row.source}>
                        <td className={TD}>{PAYMENT_SOURCE_LABELS[row.source]}</td>
                        <td className={`${TD} ${RIGHT}`}>{row.orderCount}</td>
                        <td className={`${TD} ${RIGHT}`}>{formatCurrency(row.amountCents)}</td>
                      </tr>
                    ))}
                  <tr className="font-semibold">
                    <td className={TD}>Total paid</td>
                    <td className={`${TD} ${RIGHT}`}>{sources.reduce((sum, row) => sum + row.orderCount, 0)}</td>
                    <td className={`${TD} ${RIGHT}`}>{formatCurrency(sources.reduce((sum, row) => sum + row.amountCents, 0))}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Orders by status">
            {statuses ? (
              statuses.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statuses.map((row) => (
                      <tr key={row.status}>
                        <td className={TD}>{getOrderStatusLabel(row.status)}</td>
                        <td className={`${TD} ${RIGHT}`}>{row.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Nothing>No orders in this period.</Nothing>
              )
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Sales by category (paid orders, before refunds)">
            {categories && summary ? (
              categories.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Category</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Units</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((row) => (
                      <tr key={row.categoryId ?? "uncategorized"}>
                        <td className={TD}>{row.categoryName}</td>
                        <td className={`${TD} ${RIGHT}`}>{row.unitsSold}</td>
                        <td className={`${TD} ${RIGHT}`}>{formatCurrency(row.revenueCents)}</td>
                      </tr>
                    ))}
                    {summary.grossRevenueCents - categoryItems > 0 ? (
                      <tr>
                        <td className={TD}>Shipping &amp; fees</td>
                        <td className={TD} />
                        <td className={`${TD} ${RIGHT}`}>{formatCurrency(summary.grossRevenueCents - categoryItems)}</td>
                      </tr>
                    ) : null}
                    <tr className="font-semibold">
                      <td className={TD}>Gross sales</td>
                      <td className={TD} />
                      <td className={`${TD} ${RIGHT}`}>{formatCurrency(summary.grossRevenueCents)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <Nothing>No paid sales in this period.</Nothing>
              )
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Top products (paid orders, before refunds)">
            {topProducts ? (
              topProducts.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Product</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Units</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((row) => (
                      <tr key={row.productId}>
                        <td className={TD}>{row.productTitle}</td>
                        <td className={`${TD} ${RIGHT}`}>{row.unitsSold}</td>
                        <td className={`${TD} ${RIGHT}`}>{formatCurrency(row.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Nothing>No paid sales in this period.</Nothing>
              )
            ) : (
              <Unavailable />
            )}
          </Section>

          <Section title="Restock priority (stock is live)">
            {restock ? (
              restock.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>Product</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Left</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Sold</th>
                      <th scope="col" className={`${TH} ${RIGHT}`}>Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restock.map((row) => (
                      <tr key={`${row.productId}:${row.variantId ?? ""}`}>
                        <td className={TD}>
                          {row.productTitle}
                          {row.variantLabel ? ` — ${row.variantLabel}` : ""}
                        </td>
                        <td className={`${TD} ${RIGHT}`}>{row.quantity}</td>
                        <td className={`${TD} ${RIGHT}`}>{row.unitsSoldInRange}</td>
                        <td className={`${TD} ${RIGHT}`}>{formatCurrency(row.revenueCentsInRange)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Nothing>No products are low or out of stock.</Nothing>
              )
            ) : (
              <Unavailable />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
