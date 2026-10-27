"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FILTER_CHIP_ACTIVE_THEMED as CHIP_ACTIVE,
  FILTER_CHIP_IDLE_THEMED as CHIP_IDLE,
} from "@/components/ui/filter-chip";
import {
  AUDIT_LOG_ACTIONS,
  AUDIT_LOG_ACTION_LABELS,
} from "@/features/audit-log/constants/audit-log.constants";
import { AUDIT_LOG_RANGES, AUDIT_LOG_RANGE_LABELS } from "@/features/audit-log/utils/audit-log-view";

export interface AuditLogActionFilterProps {
  /** Entry totals per action (for the active date range); omitted gives plain labels. */
  counts?: { total: number; byAction: Record<string, number> };
}

/**
 * Audit Log filters: an action dropdown (with counts) and date range chips.
 * Both live in the URL (`?action=`, `?range=`) and clear `page` on change.
 */
export function AuditLogActionFilter({ counts }: AuditLogActionFilterProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeAction = searchParams.get("action") ?? "";
  const activeRange = searchParams.get("range") ?? "";

  function updateParam(key: "action" | "range", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={activeAction}
          onChange={(event) => updateParam("action", event.target.value || null)}
          aria-label="Filter audit log by action"
          className="h-10 min-w-[14rem] rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <option value="">{counts ? `All actions (${counts.total})` : "All actions"}</option>
          {AUDIT_LOG_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_LOG_ACTION_LABELS[action]}
              {counts ? ` (${counts.byAction[action] ?? 0})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter audit log by date">
        <button
          type="button"
          aria-pressed={!activeRange}
          className={!activeRange ? CHIP_ACTIVE : CHIP_IDLE}
          onClick={() => updateParam("range", null)}
        >
          All time
        </button>
        {AUDIT_LOG_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={activeRange === range}
            className={activeRange === range ? CHIP_ACTIVE : CHIP_IDLE}
            onClick={() => updateParam("range", range)}
          >
            {AUDIT_LOG_RANGE_LABELS[range]}
          </button>
        ))}
      </div>
    </div>
  );
}
