"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FILTER_CHIP_ACTIVE_THEMED as CHIP_ACTIVE,
  FILTER_CHIP_IDLE_THEMED as CHIP_IDLE,
} from "@/components/ui/filter-chip";
import { PAYMENT_STATUS, PAYMENT_STATUS_LABELS } from "@/constants/status";
import type { PaymentStatus } from "@/constants/status";

const STATUS_CHIPS = Object.values(PAYMENT_STATUS) as PaymentStatus[];

/**
 * Status chips for the payments views — same
 * "set `status`, replace, no page param" shape as `OrderStatusFilter`.
 * Optional `counts` shows per-status totals beside each chip.
 */
export function PaymentStatusFilter({ counts }: { counts?: Record<PaymentStatus, number> } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeStatus = searchParams.get("status") ?? "";

  function updateParams(status: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Filter payments by status"
    >
      <button
        type="button"
        aria-pressed={!activeStatus}
        className={!activeStatus ? CHIP_ACTIVE : CHIP_IDLE}
        onClick={() => updateParams(null)}
      >
        All
        {counts ? <ChipCount value={STATUS_CHIPS.reduce((sum, status) => sum + counts[status], 0)} /> : null}
      </button>
      {STATUS_CHIPS.map((status) => (
        <button
          key={status}
          type="button"
          aria-pressed={activeStatus === status}
          className={activeStatus === status ? CHIP_ACTIVE : CHIP_IDLE}
          onClick={() => updateParams(status)}
        >
          {PAYMENT_STATUS_LABELS[status]}
          {counts ? <ChipCount value={counts[status]} /> : null}
        </button>
      ))}
    </div>
  );
}

function ChipCount({ value }: { value: number }) {
  return <span className="ml-1.5 tabular-nums opacity-80">{value}</span>;
}
