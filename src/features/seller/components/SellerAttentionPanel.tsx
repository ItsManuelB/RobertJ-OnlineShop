import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { getSellerTaskList } from "@/features/seller/utils/seller-tasks.server";
import type { SellerTaskTone } from "@/features/seller/utils/seller-tasks";
import { cn } from "@/lib/utils/cn";

const COUNT_TONE: Record<SellerTaskTone, string> = {
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * "Needs your attention" — live counts (never date filtered). Collapsed to one
 * line by default; opening it shows a card per task with its count and a
 * button. Same task list as the topbar bell (`getSellerTaskList`). When
 * nothing is waiting it collapses to a single all-clear line.
 */
export async function SellerAttentionPanel() {
  let tasks: Awaited<ReturnType<typeof getSellerTaskList>>;
  try {
    tasks = await getSellerTaskList();
  } catch {
    return <ErrorState message="We couldn't load your tasks right now." />;
  }

  if (tasks.length === 0) {
    return (
      <section
        aria-label="Needs your attention"
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-3"
      >
        <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="flex-1 text-sm text-foreground">
          <span className="font-semibold">You&apos;re all caught up.</span> No orders, returns or stock need your
          attention right now.
        </p>
        <Link href={ROUTES.sellerOrders} className="text-sm font-semibold text-primary underline">
          View all orders
        </Link>
      </section>
    );
  }

  return (
    <details aria-label="Needs your attention" className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
        <h2 className="flex-1 text-sm font-semibold text-foreground">
          Needs your attention · {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </h2>
        <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
        <ChevronDown
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="grid grid-cols-1 gap-2.5 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
        {tasks.map((task) => (
          <li key={task.id} className="min-w-0">
            <Link
              href={task.href}
              className="flex h-full flex-col gap-0.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className={cn("text-2xl font-semibold tabular-nums", COUNT_TONE[task.tone])}>{task.count}</span>
              <span className="text-sm font-semibold text-foreground">{task.title}</span>
              <span className="text-xs text-muted-foreground">{task.detail}</span>
              {task.urgent ? <span className="text-xs font-semibold text-danger">{task.urgent}</span> : null}
              <span className="mt-1 text-xs font-semibold text-primary">{task.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function SellerAttentionPanelSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4" role="status">
      <span className="sr-only">Loading your tasks</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
