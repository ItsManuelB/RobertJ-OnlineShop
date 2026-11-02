"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import { STOCK_STATUS_LABELS } from "@/features/inventory/constants/inventory.constants";
import type { InventoryStatusFilter, StockStatus } from "@/features/inventory/types/inventory.types";

const STATUS_ORDER: InventoryStatusFilter[] = ["needs_attention", "low_stock", "out_of_stock", "in_stock"];

function statusLabel(status: InventoryStatusFilter): string {
  return status === "needs_attention" ? "Low or out of stock" : STOCK_STATUS_LABELS[status];
}

export interface DashboardStockStatusFilterProps {
  /** Row totals per status shown beside each chip; omitted → plain chips. */
  counts?: Record<StockStatus, number>;
}

function chipCount(status: InventoryStatusFilter | "all", counts: Record<StockStatus, number>): number {
  if (status === "all") return counts.in_stock + counts.low_stock + counts.out_of_stock;
  if (status === "needs_attention") return counts.low_stock + counts.out_of_stock;
  return counts[status];
}

/** Stock-status chips for the Inventory dashboard table — sets `stockStatus`, always clears `page`. */
export function DashboardStockStatusFilter({ counts }: DashboardStockStatusFilterProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get("stockStatus") ?? "";

  function updateParams(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set("stockStatus", status);
    else params.delete("stockStatus");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by stock status">
      <button
        type="button"
        aria-pressed={!active}
        className={!active ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
        onClick={() => updateParams(null)}
      >
        All
        {counts ? <span className="ml-1.5 tabular-nums opacity-80">{chipCount("all", counts)}</span> : null}
      </button>
      {STATUS_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={active === status}
          className={active === status ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
          onClick={() => updateParams(status)}
        >
          {statusLabel(status)}
          {counts ? <span className="ml-1.5 tabular-nums opacity-80">{chipCount(status, counts)}</span> : null}
        </button>
      ))}
    </div>
  );
}
