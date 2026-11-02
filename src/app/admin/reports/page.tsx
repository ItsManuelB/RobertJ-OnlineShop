import { Suspense } from "react";
import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";
import {
  parseReportFilters,
  ReportCardSkeleton,
  ReportShopFilter,
  RepeatCustomersPanel,
  RestockPriorityPanel,
  RevenueByCategoryPanel,
  SalesByShopPanel,
  type ReportShopOption,
} from "@/features/reports";
import { REPORT_GRANULARITIES } from "@/features/reports/constants/report.constants";
import type { ReportGranularity } from "@/features/reports/types/report.types";
import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { SellerDateFilterButton } from "@/features/seller/components/SellerDateFilterButton";
import { SellerExportMenu } from "@/features/seller/components/SellerExportMenu";
import {
  SellerPerformanceSection,
  SellerPerformanceSectionSkeleton,
} from "@/features/seller/components/SellerPerformanceSection";
import { SellerReportPaymentSource, SellerReportStatus } from "@/features/seller/components/SellerReportSections";
import { SellerReportSummaryLine } from "@/features/seller/components/SellerReportSummaryLine";
import {
  pickGranularity,
  SellerSalesTrend,
  SellerSalesTrendSkeleton,
  type TrendIntervalChoice,
} from "@/features/seller/components/SellerSalesTrend";
import {
  SellerTopProducts,
  SellerTopProductsSkeleton,
  type TopProductsSort,
} from "@/features/seller/components/SellerTopProducts";
import { listShops } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Reports — Admin Portal" };

interface AdminReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const EXPORT_SECTIONS = [
  "Summary: gross, confirmed refunds, net, orders, paid orders, average order value, units, cancelled, awaiting payment",
  "Refunds in progress",
  "Gross paid by payment source",
  "Orders by status",
  "Sales by category",
  "Top products",
  "Sales over time: orders and net sales for each interval",
];

const SECTION_LINKS = [
  { href: "#overview", label: "Overview" },
  { href: "#shops", label: "Sales by shop" },
  { href: "#trend", label: "Trend" },
  { href: "#sources", label: "Where sales come from" },
  { href: "#products", label: "Products and stock" },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function displayDate(iso: string, withYear: boolean): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function rangeText(from: string, to: string): string {
  return from === to ? displayDate(from, true) : `${displayDate(from, false)} – ${displayDate(to, true)}`;
}

/**
 * Admin Reports: the Seller Reports layout at marketplace scope. Sales by shop
 * comes first (it is the comparison only an admin needs); picking a shop narrows
 * every other section to it. Each section sits in its own Suspense boundary, so
 * one failing read never hides the others.
 */
export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  const params = await searchParams;
  const parsed = parseReportFilters(params, { isAdmin: true });
  const { from, to, shopId } = parsed;

  let shops: ReportShopOption[] | undefined;
  try {
    shops = (await listShops()).map((shop) => ({ id: shop.id, name: shop.name }));
  } catch {
    shops = undefined;
  }
  const selectedShop = shops?.find((shop) => shop.id === shopId);

  const rawInterval = first(params.interval);
  const interval: TrendIntervalChoice = REPORT_GRANULARITIES.includes(rawInterval as ReportGranularity)
    ? (rawInterval as ReportGranularity)
    : "auto";
  const sort: TopProductsSort = first(params.topSort) === "sales" ? "sales" : "units";
  // The CSV's "Sales over time" uses the interval the chart is showing.
  const filters = { ...parsed, granularity: interval === "auto" ? pickGranularity(from, to) : interval };
  const previous = getPreviousPeriod(from, to);

  const hrefWith = (overrides: Record<string, string | null>) => {
    const query = new URLSearchParams({ from, to });
    if (shopId) query.set("shopId", shopId);
    if (interval !== "auto") query.set("interval", interval);
    if (sort !== "units") query.set("topSort", sort);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    return `${ROUTES.adminReports}?${query.toString()}`;
  };
  const printQuery = new URLSearchParams({
    from,
    to,
    ...(shopId ? { shopId } : {}),
    ...(interval !== "auto" ? { interval } : {}),
  }).toString();
  const intervalHrefs: Record<TrendIntervalChoice, string> = {
    auto: hrefWith({ interval: null }),
    day: hrefWith({ interval: "day" }),
    week: hrefWith({ interval: "week" }),
    month: hrefWith({ interval: "month" }),
  };
  const sortHrefs: Record<TopProductsSort, string> = {
    units: hrefWith({ topSort: null }),
    sales: hrefWith({ topSort: "sales" }),
  };

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground">
            {selectedShop ? `${selectedShop.name} only` : "All shops"} · Orders placed {rangeText(from, to)} · compared
            with {rangeText(previous.from, previous.to)} · Asia/Manila days
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shops ? <ReportShopFilter shops={shops} shopId={shopId} /> : null}
          <SellerDateFilterButton from={from} to={to} />
          <SellerExportMenu
            filters={filters}
            sections={EXPORT_SECTIONS}
            pdfHref={`${ROUTES.adminReportsPrint}?${printQuery}`}
          />
        </div>
      </div>

      <Suspense key={`summary:${from}:${to}:${shopId}`} fallback={null}>
        <SellerReportSummaryLine from={from} to={to} shopId={shopId} />
      </Suspense>

      <nav
        aria-label="Report sections"
        className="sticky top-0 z-10 -mx-5 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-5 py-2 backdrop-blur lg:-mx-7 lg:px-7"
      >
        {SECTION_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <section
        id="overview"
        aria-labelledby="overview-heading"
        className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-border bg-card p-5"
      >
        <div>
          <h2 id="overview-heading" className="text-base font-semibold text-foreground">
            Sales overview
          </h2>
          <p className="text-xs text-muted-foreground">
            The same four numbers as the dashboard, with the extra detail Reports adds.
          </p>
        </div>
        <Suspense
          key={`kpi:${from}:${to}:${shopId}`}
          fallback={<SellerPerformanceSectionSkeleton audience="admin" />}
        >
          <SellerPerformanceSection from={from} to={to} variant="reports" audience="admin" shopId={shopId} />
        </Suspense>
      </section>

      <section id="shops" aria-label="Sales by shop" className="scroll-mt-24">
        {/* Keyed so changing the dates restarts the comparison's suspense boundary. */}
        <Suspense key={`shops:${from}:${to}`} fallback={<ReportCardSkeleton />}>
          <SalesByShopPanel filters={filters} />
        </Suspense>
      </section>

      <section id="trend" aria-label="Sales trend" className="scroll-mt-24">
        <Suspense key={`trend:${from}:${to}:${interval}:${shopId}`} fallback={<SellerSalesTrendSkeleton />}>
          <SellerSalesTrend from={from} to={to} interval={interval} intervalHrefs={intervalHrefs} shopId={shopId} />
        </Suspense>
      </section>

      <div id="sources" className="-mb-3 scroll-mt-24">
        <h2 className="text-base font-semibold text-foreground">Where sales come from</h2>
        <p className="text-xs text-muted-foreground">
          How customers paid, how orders ended up, which categories sold and who came back.
        </p>
      </div>

      {/* Keyed so changing the dates or shop restarts every section's suspense boundary. */}
      <div key={`${from}:${to}:${shopId}`} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense fallback={<ReportCardSkeleton />}>
              <SellerReportPaymentSource filters={filters} />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense fallback={<ReportCardSkeleton />}>
              <SellerReportStatus filters={filters} audience="admin" />
            </Suspense>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense fallback={<ReportCardSkeleton />}>
              <RevenueByCategoryPanel filters={filters} />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense fallback={<ReportCardSkeleton />}>
              <RepeatCustomersPanel filters={filters} audience="admin" />
            </Suspense>
          </div>
        </div>

        <div id="products" className="-mb-3 scroll-mt-24">
          <h2 className="text-base font-semibold text-foreground">Products and stock</h2>
          <p className="text-xs text-muted-foreground">What sold most in this period and what to reorder first.</p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense key={`top:${sort}`} fallback={<SellerTopProductsSkeleton />}>
              <SellerTopProducts
                from={from}
                to={to}
                sort={sort}
                sortHrefs={sortHrefs}
                audience="admin"
                shopId={shopId}
              />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense fallback={<ReportCardSkeleton />}>
              <RestockPriorityPanel filters={filters} audience="admin" />
            </Suspense>
          </div>
        </div>
      </div>

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          How these numbers are worked out
        </summary>
        <p className="mt-2">
          Net sales = gross sales minus confirmed refunds, counted on the day the order was placed. The total equals
          the Net sales tile above, and the shop rows add up to the All shops line.
        </p>
        <p className="mt-2">
          In a multi-shop checkout each shop is credited its own order total. Orders count on the day they were placed
          (Asia/Manila); a refund reduces the period of the order it belongs to. Picking a shop narrows every section
          below the shop table to that shop.
        </p>
      </details>
    </div>
  );
}
