"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import { PRODUCT_STATUS, PRODUCT_STATUS_LABELS, type ProductStatus } from "@/constants/status";

const STATUS_ORDER: ProductStatus[] = [
  PRODUCT_STATUS.draft,
  PRODUCT_STATUS.active,
  PRODUCT_STATUS.sold,
  PRODUCT_STATUS.archived,
];

export interface DashboardProductStatusFilterProps {
  /** Per-status totals shown beside each label; omitted → plain chips. "All" is the sum excluding archived, matching the list's default view. */
  counts?: Record<ProductStatus, number>;
}

/** Status chips for the Products dashboard table — mirrors `OrderStatusFilter`'s exact pattern (sets `status`, always clears `page`). */
export function DashboardProductStatusFilter({ counts }: DashboardProductStatusFilterProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeStatus = searchParams.get("status") ?? "";

  function updateParams(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set("status", status);
    else params.delete("status");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter products by status">
      <button
        type="button"
        aria-pressed={!activeStatus}
        className={!activeStatus ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
        onClick={() => updateParams(null)}
      >
        All
        {counts ? <ChipCount value={allCount(counts)} /> : null}
      </button>
      {STATUS_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={activeStatus === status}
          className={activeStatus === status ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
          onClick={() => updateParams(status)}
        >
          {PRODUCT_STATUS_LABELS[status]}
          {counts ? <ChipCount value={counts[status]} /> : null}
        </button>
      ))}
    </div>
  );
}

/** The list's default ("All") view hides archived products, so its count does too. */
function allCount(counts: Record<ProductStatus, number>): number {
  return counts.draft + counts.active + counts.sold;
}

function ChipCount({ value }: { value: number }) {
  return <span className="ml-1.5 tabular-nums opacity-80">{value}</span>;
}
