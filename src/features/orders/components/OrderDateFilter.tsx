"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Date-placed dropdown for the dashboard Orders table — sets `dateRange`, always clears `page`. */
export function OrderDateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const hasCustomRange = Boolean(from && to);
  const active = hasCustomRange ? "custom" : searchParams.get("dateRange") ?? "";

  function updateParams(value: string) {
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    if (value) params.set("dateRange", value);
    else params.delete("dateRange");
    params.delete("from");
    params.delete("to");
    params.delete("page");
    const next = params.toString();

    // Same no-op-on-unchanged-URL fix as OrderStatusFilter/DashboardDateFilter.
    if (next === current) {
      router.refresh();
      return;
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={active}
        onChange={(event) => updateParams(event.target.value)}
        aria-label="Filter by date placed"
        className="h-9 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <option value="">All time</option>
        <option value="today">Today</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        {hasCustomRange ? <option value="custom" disabled>Custom range</option> : null}
      </select>
      {hasCustomRange ? (
        <span className="text-xs text-muted-foreground">
          {from} – {to} (Manila)
        </span>
      ) : null}
    </div>
  );
}
