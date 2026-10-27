import { cn } from "@/lib/utils/cn";
import type { StockStatus } from "@/features/inventory/types/inventory.types";

const BAR_TONE: Record<StockStatus, string> = {
  in_stock: "bg-success",
  low_stock: "bg-warning",
  out_of_stock: "bg-danger",
};

export interface StockLevelBarProps {
  quantity: number;
  threshold: number;
  status: StockStatus;
}

/**
 * Quantity against its low-stock threshold: the bar is full at twice the
 * threshold, so an item sitting just above the line reads as half-full.
 * Decorative — the quantity and status badge beside it carry the meaning.
 */
export function StockLevelBar({ quantity, threshold, status }: StockLevelBarProps) {
  const full = Math.max(threshold, 1) * 2;
  const percent = Math.max(0, Math.min(100, Math.round((quantity / full) * 100)));

  return (
    <span aria-hidden="true" className="mt-1.5 block h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <span className={cn("block h-full rounded-full", BAR_TONE[status])} style={{ width: `${percent}%` }} />
    </span>
  );
}
