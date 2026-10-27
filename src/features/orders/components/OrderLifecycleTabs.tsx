"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  LIFECYCLE_TAB_LABELS,
  ORDER_LIFECYCLE_TABS,
  type LifecycleTab,
} from "@/features/orders/constants/order-lifecycle.constants";
import { cn } from "@/lib/utils/cn";

export interface OrderLifecycleTabsProps {
  /** Exact per-tab counts (`getBuyerOrderLifecycleCounts`) for the "(1)"-style badges; "All" shows their sum. */
  counts: Record<LifecycleTab, number>;
}

/**
 * Shopee-style underline tab bar for the buyer `/orders` page only — All, To
 * Pay, To Ship, To Receive, Completed, Cancelled, Return/Refund. Sets a
 * `tab` URL param, always clears `page`. Deliberately a separate component
 * from `OrderStatusFilter` (the raw `order_status` chips shared verbatim by
 * the Seller/Admin dashboards, per that component's own doc comment) rather
 * than replacing it there — this is a buyer-`/orders`-only concept.
 */
export function OrderLifecycleTabs({ counts }: OrderLifecycleTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = searchParams.get("tab") ?? "";
  // The six groups partition every order, so their sum is the "All" count.
  const total = ORDER_LIFECYCLE_TABS.reduce((sum, tab) => sum + counts[tab], 0);

  function updateParams(tab: LifecycleTab | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab) {
      params.set("tab", tab);
    } else {
      params.delete("tab");
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function tabClass(isActive: boolean) {
    return cn(
      "border-b-2 px-1 pb-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30",
      isActive
        ? "border-rj-red text-rj-black"
        : "border-transparent text-rj-gray-500 hover:text-rj-black",
    );
  }

  return (
    <div
      className="flex flex-nowrap gap-6 overflow-x-auto border-b border-rj-gray-100"
      role="tablist"
      aria-label="Filter orders by status"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!activeTab}
        className={tabClass(!activeTab)}
        onClick={() => updateParams(null)}
      >
        All{total > 0 ? ` (${total})` : ""}
      </button>
      {ORDER_LIFECYCLE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={tabClass(activeTab === tab)}
          onClick={() => updateParams(tab)}
        >
          {LIFECYCLE_TAB_LABELS[tab]}
          {counts[tab] > 0 ? ` (${counts[tab]})` : ""}
        </button>
      ))}
    </div>
  );
}
