import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import {
  ExportReportButton,
  parseReportFilters,
  ReportCardSkeleton,
  RepeatCustomersPanel,
  RestockPriorityPanel,
  RevenueByCategoryPanel,
} from "@/features/reports";
import { REPORT_GRANULARITIES } from "@/features/reports/constants/report.constants";
import type { ReportGranularity } from "@/features/reports/types/report.types";
import { getPreviousPeriod } from "@/features/reports/utils/report-range";
import { SellerDateFilterButton } from "@/features/seller/components/SellerDateFilterButton";
import {
  SellerPerformanceSection,
  SellerPerformanceSectionSkeleton,
} from "@/features/seller/components/SellerPerformanceSection";
import { SellerReportPaymentSource, SellerReportStatus } from "@/features/seller/components/SellerReportSections";
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
import { getCurrentSellerOwner } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Reports — Seller Portal" };

interface SellerReportsPageProps {
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
 * Seller Reports: the same four numbers and date control as the Dashboard,
 * then the trend and breakdowns. Every section sits in its own Suspense
 * boundary, so one failing read never hides the others, and each breakdown
 * says whether it adds up to the headline figure it explains.
 */
export default async function SellerReportsPage({ searchParams }: SellerReportsPageProps) {
  const [params, owner] = await Promise.all([searchParams, getCurrentSellerOwner()]);
  const parsed = parseReportFilters(params, { isAdmin: false });
  const { from, to } = parsed;

  if (!owner.shopId) {
    return (
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">Your account isn&apos;t linked to a shop yet</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Sales, orders and stock reports appear here once an administrator assigns you to one of the RobertJ shops.
          </p>
          <Link href={ROUTES.sellerSettings} className="text-sm font-semibold text-primary underline">
            Check account settings
          </Link>
        </section>
      </div>
    );
  }

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
    if (interval !== "auto") query.set("interval", interval);
    if (sort !== "units") query.set("topSort", sort);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    return `${ROUTES.sellerReports}?${query.toString()}`;
  };
  const printQuery = new URLSearchParams({ from, to, ...(interval !== "auto" ? { interval } : {}) }).toString();
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
          <h2 className="text-lg font-semibold text-foreground">Sales report</h2>
          <p className="text-xs text-muted-foreground">
            Orders placed {rangeText(from, to)} · compared with {rangeText(previous.from, previous.to)} · Asia/Manila days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SellerDateFilterButton from={from} to={to} />
          <ExportReportButton filters={filters} sections={EXPORT_SECTIONS} />
          <Link
            href={`${ROUTES.sellerReportsPrint}?${printQuery}`}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline", size: "rjSm" })}
          >
            Export PDF
          </Link>
        </div>
      </div>

      <section aria-labelledby="overview-heading" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 id="overview-heading" className="text-base font-semibold text-foreground">Sales overview</h2>
          <p className="text-xs text-muted-foreground">The same four numbers as your dashboard, with the extra detail Reports adds.</p>
        </div>
        <Suspense key={`kpi:${from}:${to}`} fallback={<SellerPerformanceSectionSkeleton />}>
          <SellerPerformanceSection from={from} to={to} variant="reports" />
        </Suspense>
      </section>

      <section id="trend" aria-label="Sales trend" className="scroll-mt-24">
        <Suspense key={`trend:${from}:${to}:${interval}`} fallback={<SellerSalesTrendSkeleton />}>
          <SellerSalesTrend from={from} to={to} interval={interval} intervalHrefs={intervalHrefs} />
        </Suspense>
        <p className="mt-2 text-xs text-muted-foreground">
          Net sales = gross sales minus confirmed refunds, counted on the day the order was placed. The total equals the Net sales tile above.
        </p>
      </section>

      <h2 className="-mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Where your sales come from</h2>

      {/* Keyed so changing the dates restarts every section's suspense boundary. */}
      <div key={`${from}:${to}`} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense fallback={<ReportCardSkeleton />}>
              <SellerReportPaymentSource filters={filters} />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense fallback={<ReportCardSkeleton />}>
              <SellerReportStatus filters={filters} />
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
              <RepeatCustomersPanel filters={filters} />
            </Suspense>
          </div>
        </div>

        <h2 className="-mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">What sells and what to restock</h2>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <Suspense key={`top:${sort}`} fallback={<SellerTopProductsSkeleton />}>
              <SellerTopProducts from={from} to={to} sort={sort} sortHrefs={sortHrefs} />
            </Suspense>
          </div>
          <div className="min-w-0 xl:col-span-2">
            <Suspense fallback={<ReportCardSkeleton />}>
              <RestockPriorityPanel filters={filters} />
            </Suspense>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        All figures are for your shop only. In a multi-shop checkout each shop is credited its own order total. Orders count on the day they were placed (Asia/Manila); a refund reduces the period of the order it belongs to.
      </p>
    </div>
  );
}
