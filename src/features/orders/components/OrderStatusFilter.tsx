"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FILTER_CHIP_ACTIVE,
  FILTER_CHIP_ACTIVE_THEMED,
  FILTER_CHIP_IDLE,
  FILTER_CHIP_IDLE_THEMED,
} from "@/components/ui/filter-chip";
import type { OrderStatus } from "@/constants/status";
import {
  getOrderStatusLabel,
  ORDER_STATUS_FLOW,
} from "@/features/orders/constants/order.constants";

/** Stages where the seller has something to do next, so a non-zero count is flagged. */
const WORK_WAITING = new Set<OrderStatus>(["pending", "confirmed", "processing"]);

function ChipCount({ value }: { value: number }) {
  return <span className="ml-1.5 tabular-nums opacity-80">{value}</span>;
}

/**
 * Status chips for the order history. Sets `status`, always clears `page`.
 * Renders identically on Buyer /orders and both portals' Orders list — pass
 * `themed` from the portal pages only; Buyer omits it and keeps the fixed
 * rj-* chip look.
 */
export function OrderStatusFilter({
  themed = false,
  counts,
}: {
  themed?: boolean;
  /** Per-status totals shown beside each chip (portals only); omitted → plain chips. */
  counts?: Record<OrderStatus, number>;
}) {
  const CHIP_ACTIVE = themed ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_ACTIVE;
  const CHIP_IDLE = themed ? FILTER_CHIP_IDLE_THEMED : FILTER_CHIP_IDLE;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeStatus = searchParams.get("status") ?? "";

  function updateParams(status: string | null) {
    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.delete("page");
    const next = params.toString();

    // Re-clicking the already-active filter (e.g. to force-refresh a list
    // that's gone stale — an order's status changed elsewhere since this
    // page loaded) resolves to the exact same URL. router.replace() to an
    // unchanged URL is a no-op in Next.js (no new request, no refetch), so
    // without this the list would look stuck. Same fix as DashboardDateFilter.
    if (next === current) {
      router.refresh();
      return;
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter orders by status"
    >
      <button
        type="button"
        aria-pressed={!activeStatus}
        className={!activeStatus ? CHIP_ACTIVE : CHIP_IDLE}
        onClick={() => updateParams(null)}
      >
        All
        {counts ? <ChipCount value={ORDER_STATUS_FLOW.reduce((sum, status) => sum + counts[status], 0)} /> : null}
      </button>
      {ORDER_STATUS_FLOW.map((status: OrderStatus) => (
        <button
          key={status}
          type="button"
          aria-pressed={activeStatus === status}
          className={activeStatus === status ? CHIP_ACTIVE : CHIP_IDLE}
          onClick={() => updateParams(status)}
        >
          {getOrderStatusLabel(status)}
          {counts ? <ChipCount value={counts[status]} /> : null}
          {counts && counts[status] > 0 && WORK_WAITING.has(status) && activeStatus !== status ? (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-warning align-middle">
              <span className="sr-only"> (work waiting)</span>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
