"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DATE_PRESETS,
  REPORT_TIMEZONE_LABEL,
  type DatePresetId,
} from "@/features/reports/constants/report.constants";
import { resolvePreset } from "@/features/reports/utils/report-range";
import { cn } from "@/lib/utils/cn";

export interface DashboardDateFilterProps {
  from: string;
  to: string;
}

const CONTROL =
  "h-9 rounded-md border border-rj-gray-200 bg-rj-white px-3 text-sm text-rj-black focus-visible:border-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";

/**
 * Lighter sibling of `ReportsFilters` for the Overview KPI row — same
 * preset/date-range mechanism (`DATE_PRESETS`/`resolvePreset`), reused
 * rather than reimplemented, minus the granularity/shop controls Reports
 * needs and Overview doesn't (KPIs stay platform-wide for admin, no
 * per-shop narrowing here).
 */
export function DashboardDateFilter({ from, to }: DashboardDateFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function commit(range: { from: string; to: string }) {
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    params.set("from", range.from);
    params.set("to", range.to);
    const next = params.toString();

    // Re-selecting the already-active range (e.g. clicking "Today" again to
    // pull in an order placed moments ago) resolves to the exact same URL —
    // router.replace() to an unchanged URL is a no-op in Next.js (no new
    // request, no refetch), so the stale numbers would otherwise stick until
    // some other click happens to change the URL. router.refresh() forces
    // the server round-trip that a same-URL replace() can't.
    if (next === current) {
      router.refresh();
      return;
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  const activePreset = DATE_PRESETS.find((preset) => {
    const range = resolvePreset(preset.id as DatePresetId);
    return range.from === from && range.to === to;
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter dashboard by date range"
      >
        {DATE_PRESETS.map((preset) => {
          const isActive = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => commit(resolvePreset(preset.id as DatePresetId))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
                isActive
                  ? "border-rj-black bg-rj-black text-rj-white"
                  : "border-rj-gray-200 text-rj-gray-600 hover:border-rj-black",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-rj-gray-500">
        From
        <input
          type="date"
          value={from}
          max={to}
          onChange={(event) => event.target.value && commit({ from: event.target.value, to })}
          className={CONTROL}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-rj-gray-500">
        To
        <input
          type="date"
          value={to}
          min={from}
          onChange={(event) => event.target.value && commit({ from, to: event.target.value })}
          className={CONTROL}
        />
      </label>

      <p className="w-full text-[11px] text-rj-gray-400">
        Dates use the {REPORT_TIMEZONE_LABEL} day boundary.
      </p>
    </div>
  );
}
