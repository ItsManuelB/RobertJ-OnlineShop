// Type-only imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.
import type { BuyerActivityEvent, BuyerActivityEventType } from "../types/notification.types";

export const ACTIVITY_CATEGORIES = ["orders", "payments", "returns"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  orders: "Orders",
  payments: "Payments",
  returns: "Returns",
};

const CATEGORY_BY_EVENT: Record<BuyerActivityEventType, ActivityCategory> = {
  order_placed: "orders",
  order_shipped: "orders",
  order_delivered: "orders",
  receipt_confirmed: "orders",
  order_cancelled: "orders",
  cancellation_requested: "orders",
  cancellation_declined: "orders",
  payment_confirmed: "payments",
  receipt_submitted: "payments",
  payment_verified: "payments",
  payment_failed: "payments",
  refund_completed: "payments",
  refund_needs_attention: "payments",
  return_filed: "returns",
  return_rejected_by_seller: "returns",
  return_rejected: "returns",
  return_refunded: "returns",
  return_replacement_approved: "returns",
};

/** Events that tell the buyer something went wrong or needs a look. */
const ATTENTION_EVENTS: ReadonlySet<BuyerActivityEventType> = new Set([
  "payment_failed",
  "refund_needs_attention",
  "cancellation_declined",
  "return_rejected_by_seller",
  "return_rejected",
]);

export function getActivityCategory(eventType: BuyerActivityEventType): ActivityCategory {
  return CATEGORY_BY_EVENT[eventType];
}

export function isAttentionEvent(eventType: BuyerActivityEventType): boolean {
  return ATTENTION_EVENTS.has(eventType);
}

/** Unknown or missing URL values mean "all types". */
export function parseActivityCategory(value: string | undefined): ActivityCategory | null {
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value ?? "") ? (value as ActivityCategory) : null;
}

export function filterActivity(events: readonly BuyerActivityEvent[], category: ActivityCategory | null) {
  return category ? events.filter((event) => getActivityCategory(event.eventType) === category) : [...events];
}

export interface ActivityDayGroup {
  key: "today" | "yesterday" | "earlier";
  label: string;
  events: BuyerActivityEvent[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Whole Manila days since the epoch, so "today" follows the shop's calendar, not the server's. */
function manilaDay(ms: number): number {
  return Math.floor((ms + MANILA_OFFSET_MS) / DAY_MS);
}

/** Groups newest-first events into Today / Yesterday / Earlier, dropping empty groups. `now` defaults here so render stays pure. */
export function groupActivityByDay(
  events: readonly BuyerActivityEvent[],
  now: number = Date.now(),
): ActivityDayGroup[] {
  const today = manilaDay(now);
  const groups: ActivityDayGroup[] = [
    { key: "today", label: "Today", events: [] },
    { key: "yesterday", label: "Yesterday", events: [] },
    { key: "earlier", label: "Earlier", events: [] },
  ];
  for (const event of events) {
    const age = today - manilaDay(Date.parse(event.occurredAt));
    groups[age <= 0 ? 0 : age === 1 ? 1 : 2].events.push(event);
  }
  return groups.filter((group) => group.events.length > 0);
}
