"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";

import { Drawer } from "@/components/ui/drawer";
import { buttonVariants } from "@/components/ui/button";
import { SELLER_METRICS, type SellerMetricKey } from "@/features/seller/constants/metrics";
import { cn } from "@/lib/utils/cn";

export interface MetricInfoButtonProps {
  metric: SellerMetricKey;
  /** This period's figure and working, e.g. "₱10,000.00 − ₱500.00 = ₱9,500.00". */
  calculation: string;
  /** Period label, e.g. "Oct 1 – Oct 23, 2026". */
  periodLabel: string;
  /** Existing page to drill into with the same date range. */
  drillHref: string;
  drillLabel: string;
}

/** Info button that opens a plain-language definition of one sales metric. */
export function MetricInfoButton({ metric, calculation, periodLabel, drillHref, drillLabel }: MetricInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const def = SELLER_METRICS[metric];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`How ${def.title} is calculated`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={def.title}
        footer={
          <Link href={drillHref} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            {drillLabel}
          </Link>
        }
      >
        <div className="flex flex-col gap-4 text-sm text-foreground">
          <p>{def.definition}</p>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              This period ({periodLabel})
            </p>
            <p className="mt-1 font-semibold tabular-nums">{calculation}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-success">Counts</p>
            <ul className="list-disc space-y-1 pl-5">
              {def.counts.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-danger">Doesn&apos;t count</p>
            <ul className="list-disc space-y-1 pl-5">
              {def.excludes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </Drawer>
    </>
  );
}
