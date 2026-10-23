"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import type { SellerTask, SellerTaskTone } from "@/features/seller/utils/seller-tasks";
import { cn } from "@/lib/utils/cn";

const COUNT_TONE: Record<SellerTaskTone, string> = {
  info: "bg-info/15 text-info",
  warning: "bg-warning/20 text-warning",
  danger: "bg-danger/15 text-danger",
};

export interface SellerAttentionToggleProps {
  tasks: readonly SellerTask[];
  /** Collapsed-state summary line, built server-side from the same tasks. */
  summary: string;
  allClearHref: string;
}

/**
 * Collapsible "Needs your attention" card. Closed by default: the header
 * shows how many tasks are waiting and a one-line summary, and the arrow
 * opens the full list in place (it pushes the page down, never covers it).
 */
export function SellerAttentionToggle({ tasks, summary, allClearHref }: SellerAttentionToggleProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const clear = tasks.length === 0;

  return (
    <section aria-labelledby={`${panelId}-title`} className="rounded-2xl border border-border bg-card">
      <h2 id={`${panelId}-title`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold",
              clear ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
            )}
          >
            {clear ? <Check className="h-4 w-4" aria-hidden="true" /> : tasks.length}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-semibold text-foreground">Needs your attention</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {clear ? "You're all caught up" : summary} · live
            </span>
          </span>
          <span className="text-xs font-semibold text-primary">{open ? "Hide" : "Show"}</span>
          <ChevronDown
            className={cn("h-5 w-5 shrink-0 text-primary transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </h2>

      <div id={panelId} hidden={!open} className="px-4 pb-4">
        {clear ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No orders, returns or stock need your attention right now.{" "}
            <Link href={allClearHref} className="font-semibold text-primary underline">
              View all orders
            </Link>
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <li key={task.id} className="flex gap-3 rounded-xl border border-border p-4">
                <span
                  className={cn(
                    "flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-lg font-bold tabular-nums",
                    COUNT_TONE[task.tone],
                  )}
                >
                  {task.count}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
                  <p className="text-xs text-muted-foreground">{task.detail}</p>
                  {task.urgent ? <p className="text-xs font-semibold text-danger">{task.urgent}</p> : null}
                  <Link
                    href={task.href}
                    className="mt-1 inline-flex min-h-9 items-center self-start rounded-lg border border-border px-3 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {task.cta} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
