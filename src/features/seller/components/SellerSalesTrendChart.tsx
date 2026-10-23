"use client";

import { useState } from "react";

import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

export interface SellerTrendBucket {
  /** Full label for the readout, e.g. "Oct 3" or "Week of Oct 6". */
  label: string;
  /** Short label for the x-axis. */
  tick: string;
  /** Net sales in centavos (gross minus confirmed refunds). */
  netCents: number;
  orders: number;
}

export interface SellerSalesTrendChartProps {
  buckets: SellerTrendBucket[];
  /** "daily" | "weekly" | "monthly". */
  granularityLabel: string;
  /** Unit word for the summary: "day", "week" or "month". */
  unit: string;
}

type Metric = "net" | "orders";

const TABS: ReadonlyArray<{ id: Metric; label: string }> = [
  { id: "net", label: "Net sales" },
  { id: "orders", label: "Orders" },
];

const CHART_HEIGHT = 180;

function pesoShort(cents: number): string {
  const value = cents / 100;
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return `₱${Math.round(value)}`;
}

/**
 * Seller Dashboard trend: one bar chart with a Net sales / Orders switch, a
 * y-axis, a hover/focus readout and a text summary. Bars are plain divs; the
 * full series is also available to assistive tech as a hidden table.
 */
export function SellerSalesTrendChart({ buckets, granularityLabel, unit }: SellerSalesTrendChartProps) {
  const [metric, setMetric] = useState<Metric>("net");
  const [hover, setHover] = useState<number | null>(null);

  const value = (bucket: SellerTrendBucket) => (metric === "net" ? bucket.netCents : bucket.orders);
  const format = (n: number) => (metric === "net" ? formatCurrency(n) : `${n} order${n === 1 ? "" : "s"}`);
  const max = buckets.reduce((m, b) => Math.max(m, value(b)), 0);
  const total = buckets.reduce((sum, b) => sum + value(b), 0);
  const best = buckets.reduce<SellerTrendBucket | null>((top, b) => (top === null || value(b) > value(top) ? b : top), null);
  const step = Math.max(1, Math.ceil(buckets.length / 8));
  const gap = buckets.length > 40 ? 0.5 : buckets.length > 14 ? 1.5 : 4;
  const active = hover !== null ? buckets[hover] : null;

  const summary = active
    ? `${active.label} · ${formatCurrency(active.netCents)} net sales · ${active.orders} order${active.orders === 1 ? "" : "s"}`
    : `${metric === "net" ? "Net sales " : ""}${format(total)} across ${buckets.length} ${unit}${buckets.length === 1 ? "" : "s"}${
        best && value(best) > 0 ? ` · best ${unit}: ${best.label} (${format(value(best))})` : ""
      }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Sales trend <span className="font-normal text-muted-foreground">· {granularityLabel}</span>
        </h3>
        <div role="tablist" aria-label="Trend metric" className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={metric === tab.id}
              onClick={() => {
                setMetric(tab.id);
                setHover(null);
              }}
              className={cn(
                "min-h-9 rounded-md px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                metric === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="min-h-5 text-sm text-foreground/80">
        {summary}
      </p>

      {total === 0 ? (
        <div className="flex h-44 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-sm font-semibold text-foreground">No sales in this period yet</p>
          <p className="text-xs text-muted-foreground">Paid orders will appear here. Try a wider date range.</p>
        </div>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${metric === "net" ? "Net sales" : "Orders placed"} per ${unit}. Total ${format(total)}.`}
            className="flex flex-col gap-1.5"
          >
            <div className="flex gap-2">
              <div
                aria-hidden="true"
                className="flex min-w-[52px] flex-col justify-between text-right text-[11px] text-muted-foreground"
                style={{ height: CHART_HEIGHT }}
              >
                <span>{metric === "net" ? pesoShort(max) : max}</span>
                <span>{metric === "net" ? pesoShort(max / 2) : Math.round(max / 2)}</span>
                <span>0</span>
              </div>
              <div
                onMouseLeave={() => setHover(null)}
                className="flex min-w-0 flex-1 items-end border-b border-border"
                style={{
                  height: CHART_HEIGHT,
                  backgroundImage: "linear-gradient(var(--subtle-border) 1px, transparent 1px)",
                  backgroundSize: `100% ${CHART_HEIGHT / 2}px`,
                }}
              >
                {buckets.map((bucket, index) => {
                  const v = value(bucket);
                  return (
                    <div
                      key={bucket.label}
                      onMouseEnter={() => setHover(index)}
                      className="flex h-full min-w-0 flex-1 items-end"
                      style={{ padding: `0 ${gap}px` }}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-[3px] transition-colors",
                          metric === "net" ? "bg-primary" : "bg-info",
                          hover === index && "opacity-70",
                        )}
                        style={{ height: `${max ? (v / max) * 100 : 0}%`, minHeight: v > 0 ? 2 : 0 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div aria-hidden="true" className="flex pl-[60px] text-[11px] text-muted-foreground">
              {buckets.map((bucket, index) => (
                <span key={bucket.label} className="min-w-0 flex-1 whitespace-nowrap">
                  {index % step === 0 ? bucket.tick : ""}
                </span>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>Net sales and orders per {unit}</caption>
            <thead>
              <tr>
                <th scope="col">{unit}</th>
                <th scope="col">Net sales</th>
                <th scope="col">Orders</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.label}>
                  <th scope="row">{bucket.label}</th>
                  <td>{formatCurrency(bucket.netCents)}</td>
                  <td>{bucket.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
