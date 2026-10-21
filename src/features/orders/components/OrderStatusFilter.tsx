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

/**
 * Status chips for the order history. Sets `status`, always clears `page`.
 * Renders identically on Buyer /orders and both portals' Orders list — pass
 * `themed` from the portal pages only; Buyer omits it and keeps the fixed
 * rj-* chip look.
 */
export function OrderStatusFilter({ themed = false }: { themed?: boolean }) {
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
        </button>
      ))}
    </div>
  );
}
