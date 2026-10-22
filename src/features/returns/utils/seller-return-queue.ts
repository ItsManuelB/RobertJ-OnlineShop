import { RETURN_STATUS } from "@/constants/status";
import type { ReturnRequest } from "@/features/returns/types/return.types";

/**
 * Seller returns queue tabs. "Needs my action" is what the seller can act on
 * right now (respond, record item condition, ship a replacement) — the
 * default view, so they aren't scrolling past closed requests to find work.
 */
export const SELLER_RETURN_TABS = ["action", "admin", "closed", "all"] as const;
export type SellerReturnTab = (typeof SELLER_RETURN_TABS)[number];

export const SELLER_RETURN_TAB_LABELS: Record<SellerReturnTab, string> = {
  action: "Needs my action",
  admin: "Waiting on admin",
  closed: "Closed",
  all: "All",
};

export const DEFAULT_SELLER_RETURN_TAB: SellerReturnTab = "action";

export function isSellerReturnTab(value: string | null | undefined): value is SellerReturnTab {
  return (SELLER_RETURN_TABS as readonly string[]).includes(value ?? "");
}

/** Which single non-"all" tab a request belongs to. */
export function sellerReturnBucket(request: ReturnRequest): Exclude<SellerReturnTab, "all"> {
  switch (request.status) {
    case RETURN_STATUS.pending:
      return "action";
    case RETURN_STATUS.sellerAccepted:
    case RETURN_STATUS.sellerRejected:
      return "admin";
    case RETURN_STATUS.refunded:
      return !request.restockedAt && !request.markedUnsellableAt ? "action" : "closed";
    case RETURN_STATUS.replacementApproved:
      return request.replacementShippedAt ? "closed" : "action";
    default:
      return "closed";
  }
}

export function matchesSellerReturnTab(request: ReturnRequest, tab: SellerReturnTab): boolean {
  return tab === "all" || sellerReturnBucket(request) === tab;
}
