import Link from "next/link";

import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import { ROUTES } from "@/constants/routes";
import {
  SELLER_RETURN_TABS,
  SELLER_RETURN_TAB_LABELS,
  type SellerReturnTab,
} from "@/features/returns/utils/seller-return-queue";

export interface ReturnQueueTabsProps {
  active: SellerReturnTab;
  counts: Record<SellerReturnTab, number>;
}

/** Server-rendered tab links for the seller returns queue — each is a plain `?tab=` URL, so there's no client state to keep in sync. */
export function ReturnQueueTabs({ active, counts }: ReturnQueueTabsProps) {
  return (
    <nav aria-label="Filter return requests" className="flex flex-wrap gap-2">
      {SELLER_RETURN_TABS.map((tab) => (
        <Link
          key={tab}
          href={`${ROUTES.sellerReturns}?tab=${tab}`}
          aria-current={active === tab ? "page" : undefined}
          className={active === tab ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED}
        >
          {SELLER_RETURN_TAB_LABELS[tab]} ({counts[tab]})
        </Link>
      ))}
    </nav>
  );
}
