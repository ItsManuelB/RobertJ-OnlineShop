import Link from "next/link";

import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import {
  LIFECYCLE_TAB_LABELS,
  ORDER_LIFECYCLE_TABS,
  type LifecycleTab,
} from "@/features/orders/constants/order-lifecycle.constants";
import { cn } from "@/lib/utils/cn";

/** The same six groups and counts as the Orders tabs, each opening that tab. */
export function OrderGroupCounts({ counts }: { counts: Record<LifecycleTab, number> }) {
  return (
    <section aria-label="Orders by group" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {ORDER_LIFECYCLE_TABS.map((tab) => (
        <Link
          key={tab}
          href={`${ROUTES.orders}?tab=${tab}`}
          className={cn(
            RJ_CARD,
            "p-4 transition-all hover:border-rj-black hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
          )}
        >
          <p className="text-2xl font-bold text-rj-black">{counts[tab]}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-rj-gray-600">
            {LIFECYCLE_TAB_LABELS[tab]}
          </p>
        </Link>
      ))}
    </section>
  );
}
