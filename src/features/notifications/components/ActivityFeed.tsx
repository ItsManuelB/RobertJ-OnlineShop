import Link from "next/link";
import { AlertTriangle, CreditCard, Receipt, RotateCcw, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/feedback/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { ACTIVITY_EVENT_COPY } from "@/features/notifications/constants/notification.constants";
import type { BuyerActivityEvent } from "@/features/notifications/types/notification.types";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  filterActivity,
  getActivityCategory,
  groupActivityByDay,
  isAttentionEvent,
  type ActivityCategory,
} from "@/features/notifications/utils/activity-view";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

export interface ActivityFeedProps {
  events: BuyerActivityEvent[];
  /** Active type chip from the URL, or null for all. */
  category: ActivityCategory | null;
  /** The most rows the feed was asked for; reaching it means older updates exist. */
  limit: number;
}

const CATEGORY_ICONS: Record<ActivityCategory, LucideIcon> = {
  orders: Receipt,
  payments: CreditCard,
  returns: RotateCcw,
};

const CHIP_CLASS =
  "inline-flex min-h-9 items-center rounded-full border-[1.5px] px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";

/** Read-only order/payment activity, grouped by day with type chips — see `get_buyer_activity_feed`. */
export function ActivityFeed({ events, category, limit }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Updates on your orders and payments will show up here."
        action={
          <Link href={ROUTES.products} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
            Browse products
          </Link>
        }
      />
    );
  }

  const shown = filterActivity(events, category);
  const groups = groupActivityByDay(shown);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
        {[null, ...ACTIVITY_CATEGORIES].map((value) => (
          <Link
            key={value ?? "all"}
            href={value ? `${ROUTES.notifications}?type=${value}` : ROUTES.notifications}
            aria-current={category === value ? "page" : undefined}
            className={cn(
              CHIP_CLASS,
              category === value
                ? "border-rj-black bg-rj-black text-rj-white"
                : "border-rj-gray-200 text-rj-gray-600 hover:border-rj-black hover:text-rj-black",
            )}
          >
            {value ? ACTIVITY_CATEGORY_LABELS[value] : "All"}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <EmptyState
          title="Nothing in this filter"
          description="Try another type."
          action={
            <Link href={ROUTES.notifications} className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}>
              Show all
            </Link>
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label} className="flex flex-col gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-400">{group.label}</h2>
            <ul className="flex flex-col gap-2">
              {group.events.map((event, index) => {
                const Icon = isAttentionEvent(event.eventType)
                  ? AlertTriangle
                  : CATEGORY_ICONS[getActivityCategory(event.eventType)];
                return (
                  <li
                    key={`${event.orderId}-${event.eventType}-${index}`}
                    className={cn(RJ_CARD, "flex items-center gap-3 p-3.5")}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        isAttentionEvent(event.eventType) ? "bg-warning/15 text-warning" : "bg-rj-gray-100 text-rj-gray-600",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={ROUTES.orderDetail(event.orderId)}
                        className="text-sm font-medium text-rj-black hover:underline"
                      >
                        {ACTIVITY_EVENT_COPY[event.eventType].label(event.orderNumber)}
                      </Link>
                      <p className="mt-0.5 text-xs text-rj-gray-400">{formatDateTime(event.occurredAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {events.length >= limit ? (
        <p className="text-center text-xs text-rj-gray-400">Showing your latest {limit} updates</p>
      ) : null}
    </div>
  );
}
