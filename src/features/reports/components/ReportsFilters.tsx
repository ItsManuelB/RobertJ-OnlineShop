"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils/cn";

import {
  DATE_PRESETS,
  GRANULARITY_LABELS,
  REPORT_GRANULARITIES,
  REPORT_TIMEZONE_LABEL,
  type DatePresetId,
} from "../constants/report.constants";
import type { ReportFilters } from "../types/report.types";
import { resolvePreset } from "../utils/report-range";

export interface ReportShopOption {
  id: string;
  name: string;
}

export interface ReportsFiltersProps {
  filters: ReportFilters;
  isAdmin: boolean;
  shops?: ReportShopOption[];
}

const CONTROL =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * Client filter bar: date presets, an explicit range, trend granularity, and
 * (admins only) a shop picker. Every change is pushed into the URL search
 * params so the server components re-read and the Suspense boundaries restart.
 */
export function ReportsFilters({ filters, isAdmin, shops }: ReportsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function commit(next: Partial<ReportFilters>) {
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    const merged = { ...filters, ...next };

    params.set("from", merged.from);
    params.set("to", merged.to);
    params.set("granularity", merged.granularity);
    if (isAdmin && merged.shopId) {
      params.set("shopId", merged.shopId);
    } else {
      params.delete("shopId");
    }

    const nextQuery = params.toString();
    startTransition(() => {
      // Re-picking the already-active preset/range resolves to the exact
      // same URL — router.push() to an unchanged URL is a no-op in Next.js
      // (no new request, no refetch) — so without this, the report would
      // look stuck until some other click happened to change the URL.
      if (nextQuery === current) {
        router.refresh();
        return;
      }
      router.push(`${pathname}?${nextQuery}`);
    });
  }

  const activePreset = DATE_PRESETS.find((preset) => {
    const range = resolvePreset(preset.id as DatePresetId);
    return range.from === filters.from && range.to === filters.to;
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-subtle-border p-4",
        isPending && "opacity-60",
      )}
      aria-busy={isPending}
    >
      <div className="flex flex-wrap items-center gap-2">
        {DATE_PRESETS.map((preset) => {
          const isActive = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => commit(resolvePreset(preset.id as DatePresetId))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                isActive
                  ? "border-filter-active bg-filter-active text-filter-active-foreground"
                  : "border-border text-muted-foreground hover:border-primary",
              )}
              aria-pressed={isActive}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-rj-gray-500 dark:text-muted-foreground">
          From
          <input
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(e) => e.target.value && commit({ from: e.target.value })}
            className={CONTROL}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-rj-gray-500 dark:text-muted-foreground">
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(e) => e.target.value && commit({ to: e.target.value })}
            className={CONTROL}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-rj-gray-500 dark:text-muted-foreground">
          Trend
          <select
            value={filters.granularity}
            onChange={(e) =>
              commit({ granularity: e.target.value as ReportFilters["granularity"] })
            }
            className={CONTROL}
          >
            {REPORT_GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {GRANULARITY_LABELS[g]}
              </option>
            ))}
          </select>
        </label>

        {isAdmin && shops && shops.length > 0 ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-rj-gray-500 dark:text-muted-foreground">
            Shop
            <select
              value={filters.shopId ?? ""}
              onChange={(e) => commit({ shopId: e.target.value || null })}
              className={CONTROL}
            >
              <option value="">All shops</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p className="text-[11px] text-rj-gray-400 dark:text-muted-foreground">
        Dates use the {REPORT_TIMEZONE_LABEL} day boundary.
      </p>
    </div>
  );
}
