import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export interface ReviewQueueTab {
  value: string;
  label: string;
  href: string;
}

/** Underline tabs for the portal review pages; plain links so each tab is its own URL. */
export function ReviewQueueTabs({ tabs, active, label }: { tabs: ReviewQueueTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-5 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          aria-current={tab.value === active ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-1 pb-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            tab.value === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
