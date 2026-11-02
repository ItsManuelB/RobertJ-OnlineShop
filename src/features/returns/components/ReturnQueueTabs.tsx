import Link from "next/link";

import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";

export interface ReturnQueueTabsProps {
  /** The queue's own route — each tab is a plain `?tab=` link on it. */
  basePath: string;
  active: string;
  tabs: readonly { value: string; label: string; count: number }[];
}

/** Server-rendered tab links for a returns queue (seller or admin) — each is a plain `?tab=` URL, so there's no client state to keep in sync. */
export function ReturnQueueTabs({ basePath, active, tabs }: ReturnQueueTabsProps) {
  return (
    <nav aria-label="Filter return requests" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`${basePath}?tab=${tab.value}`}
          aria-current={active === tab.value ? "page" : undefined}
          className={active === tab.value ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
        >
          {tab.label}
          <span className="ml-1.5 tabular-nums opacity-80">{tab.count}</span>
        </Link>
      ))}
    </nav>
  );
}
