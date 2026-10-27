import type { ReturnRequest } from "../types/return.types";

// No value imports on purpose: this file is unit-tested with plain Node, which
// can't resolve the `@/` alias. Status strings are checked against the
// `ReturnRequest["status"]` union by the compiler.

/**
 * Admin returns queue tabs. "Needs my decision" is what only an administrator
 * can do right now — decide a request the seller answered, confirm a refund
 * once the item is back, or step in on a seller who never replied — and is the
 * default view, so the work is not buried under requests that are in hand.
 */
export const ADMIN_RETURN_TABS = ["decide", "payouts", "progress", "closed", "all"] as const;
export type AdminReturnTab = (typeof ADMIN_RETURN_TABS)[number];

export const ADMIN_RETURN_TAB_LABELS: Record<AdminReturnTab, string> = {
  decide: "Needs my decision",
  payouts: "COD payouts",
  progress: "In progress",
  closed: "Closed",
  all: "All",
};

export const DEFAULT_ADMIN_RETURN_TAB: AdminReturnTab = "decide";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mirrors `decide_return`'s `interval '3 days'` and `RETURN_SELLER_RESPONSE_SLA_DAYS` — same "kept in sync by comment" pattern as `getOverduePendingReturnCount`. */
const SELLER_RESPONSE_WINDOW_DAYS = 3;

export function isAdminReturnTab(value: string | null | undefined): value is AdminReturnTab {
  return (ADMIN_RETURN_TABS as readonly string[]).includes(value ?? "");
}

/**
 * A still-pending request whose seller has had the whole response window.
 * The RPC is the real enforcement; this only decides which tab the request is listed in.
 */
export function isSellerReplyOverdue(request: ReturnRequest, now: number = Date.now()): boolean {
  return (
    request.status === "pending" &&
    now - new Date(request.createdAt).getTime() > SELLER_RESPONSE_WINDOW_DAYS * DAY_MS
  );
}

/** Which single non-"all" tab a request belongs to. */
export function adminReturnBucket(
  request: ReturnRequest,
  now: number = Date.now(),
): Exclude<AdminReturnTab, "all"> {
  switch (request.status) {
    case "pending":
      return isSellerReplyOverdue(request, now) ? "decide" : "progress";
    case "seller_accepted":
    case "seller_rejected":
    case "return_received":
      return "decide";
    case "refund_due":
      return "payouts";
    case "awaiting_return":
    case "return_shipped":
    case "replacement_approved":
    case "replacement_shipped":
      return "progress";
    case "refunded":
      // Money is out, but the seller still has to record the item's condition.
      return !request.restockedAt && !request.markedUnsellableAt ? "progress" : "closed";
    default:
      return "closed";
  }
}

export function matchesAdminReturnTab(
  request: ReturnRequest,
  tab: AdminReturnTab,
  now: number = Date.now(),
): boolean {
  return tab === "all" || adminReturnBucket(request, now) === tab;
}
