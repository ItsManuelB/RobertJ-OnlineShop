import Link from "next/link";
import { Check } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { ORDER_STATUS } from "@/constants/status";
import { getLowStockReport, getOrderAttentionCounts } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

export interface AdminShopAttentionProps {
  shopId: string;
}

/**
 * "Needs attention" for one shop: orders waiting for confirmation, orders late to ship and
 * products running low. Live counts (never date filtered), each opening the matching list
 * already narrowed to this shop. Mirrors the Seller dashboard's tasks, scoped by the admin.
 */
export async function AdminShopAttention({ shopId }: AdminShopAttentionProps) {
  let counts: Awaited<ReturnType<typeof getOrderAttentionCounts>>;
  let lowStock: Awaited<ReturnType<typeof getLowStockReport>>;
  try {
    [counts, lowStock] = await Promise.all([getOrderAttentionCounts(shopId), getLowStockReport(shopId)]);
  } catch {
    return <ErrorState message="We couldn't load this shop's attention list right now." />;
  }

  const shop = encodeURIComponent(shopId);
  const tasks = [
    {
      id: "confirm",
      count: counts.needsConfirmation,
      title: "Orders to confirm",
      description: "Waiting for the shop to accept them.",
      href: `${ROUTES.adminOrders}?shopId=${shop}&status=${ORDER_STATUS.pending}`,
      urgent: false,
    },
    {
      id: "overdue",
      count: counts.overdueToShip,
      title: "Late to ship",
      description: "Confirmed a while ago and still not shipped.",
      href: `${ROUTES.adminOrders}?shopId=${shop}&status=${ORDER_STATUS.confirmed}`,
      urgent: true,
    },
    {
      id: "stock",
      count: lowStock.length,
      title: "Low stock",
      description: "Products at or below their reorder level.",
      href: `${ROUTES.adminInventory}?shopId=${shop}`,
      urgent: false,
    },
  ].filter((task) => task.count > 0);

  if (tasks.length === 0) {
    return (
      <section
        aria-label="Needs attention"
        role="status"
        className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-3"
      >
        <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">This shop is all caught up.</span> No orders or stock need attention right now.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Needs attention" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">Needs attention</h2>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <li key={task.id} className="min-w-0">
            <Link
              href={task.href}
              className="flex h-full flex-col gap-0.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className={cn("text-2xl font-semibold tabular-nums", task.urgent ? "text-danger" : "text-warning")}>
                {task.count}
              </span>
              <span className="text-sm font-semibold text-foreground">{task.title}</span>
              <span className="text-xs text-muted-foreground">{task.description}</span>
              <span className="mt-1 text-xs font-semibold text-primary">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminShopAttentionSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="status">
      <span className="sr-only">Loading this shop&apos;s attention list</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}
