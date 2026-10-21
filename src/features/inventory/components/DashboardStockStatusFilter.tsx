"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import { STOCK_STATUS_LABELS } from "@/features/inventory/constants/inventory.constants";
import type { InventoryStatusFilter } from "@/features/inventory/types/inventory.types";

const STATUS_ORDER: InventoryStatusFilter[] = ["needs_attention", "low_stock", "out_of_stock", "in_stock"];

function statusLabel(status: InventoryStatusFilter): string {
  return status === "needs_attention" ? "Low or out of stock" : STOCK_STATUS_LABELS[status];
}

/** Stock-status chips for the Inventory dashboard table — sets `stockStatus`, always clears `page`. */
export function DashboardStockStatusFilter() {
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
        </button>
      ))}
    </div>
  );
}
