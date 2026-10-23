"use client";

import { useId, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";

import {
  DATE_PRESETS,
  REPORT_TIMEZONE_LABEL,
  type DatePresetId,
} from "@/features/reports/constants/report.constants";
import { manilaToday, resolvePreset } from "@/features/reports/utils/report-range";
import { cn } from "@/lib/utils/cn";

export interface SellerDateFilterButtonProps {
  from: string;
  to: string;
}

const PRESET_NAMES: Record<DatePresetId, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  month: "This month",
};

const FIELD =
  "h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function formatShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Compact date-range filter for the Seller Dashboard's performance section:
 * one button showing the active range, opening a panel with the presets and
 * a custom From/To range. Writes `from`/`to` to the URL like
 * `DashboardDateFilter`, so server panels re-render for the new range.
 */
export function SellerDateFilterButton({ from, to }: SellerDateFilterButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [error, setError] = useState("");
  const today = manilaToday();

  const activePreset = DATE_PRESETS.find((preset) => {
    const range = resolvePreset(preset.id as DatePresetId);
    return range.from === from && range.to === to;
  });
  const buttonLabel = activePreset
    ? PRESET_NAMES[activePreset.id as DatePresetId]
    : from === to
      ? formatShort(from)
      : `${formatShort(from)} – ${formatShort(to)}`;

  function commit(range: { from: string; to: string }) {
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    params.set("from", range.from);
    params.set("to", range.to);
    const next = params.toString();
    setOpen(false);
    // Re-selecting the active range is a no-op URL change in Next.js, so force a refetch.
    if (next === current) {
      router.refresh();
      return;
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  function applyCustom() {
    if (!draftFrom || !draftTo) return setError("Choose both dates.");
    if (draftFrom > draftTo) return setError("The start date must be on or before the end date.");
    if (draftTo > today) return setError("The end date can't be in the future.");
    setError("");
    commit({ from: draftFrom, to: draftTo });
  }

  function toggle() {
    if (!open) {
      setDraftFrom(from);
      setDraftTo(to);
      setError("");
    }
    setOpen((value) => !value);
  }

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span>{buttonLabel}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close date filter"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            id={panelId}
            role="dialog"
            aria-label="Filter by date"
            className="absolute right-0 top-full z-50 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-lg"
          >
            <div role="group" aria-label="Date range presets" className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => {
                const isActive = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => commit(resolvePreset(preset.id as DatePresetId))}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      isActive
                        ? "border-filter-active bg-filter-active text-filter-active-foreground"
                        : "border-border text-muted-foreground hover:border-primary",
                    )}
                  >
                    {PRESET_NAMES[preset.id as DatePresetId]}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                From
                <input type="date" value={draftFrom} max={today} onChange={(e) => setDraftFrom(e.target.value)} className={FIELD} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                To
                <input type="date" value={draftTo} max={today} onChange={(e) => setDraftTo(e.target.value)} className={FIELD} />
              </label>
            </div>
            {error ? (
              <p role="alert" className="text-xs font-semibold text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">Dates use the {REPORT_TIMEZONE_LABEL} day boundary.</p>
              <button
                type="button"
                onClick={applyCustom}
                className="min-h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
