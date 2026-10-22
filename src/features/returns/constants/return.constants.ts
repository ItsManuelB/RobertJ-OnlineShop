import type { ReturnReasonCode, ReturnRequestType } from "@/features/returns/types/return.types";

/**
 * Audit finding F-09: how long after delivery (or a paid cancellation) a
 * buyer may still file a return. The authoritative enforcement is the
 * `request_return` RPC (see `supabase/migrations/
 * 20261011174440_return_request_eligibility_window.sql`) — this constant is
 * the single source for any UI copy that needs to state the policy, kept in
 * sync with that migration's literal `interval '7 days'`.
 */
export const RETURN_WINDOW_DAYS = 7;

/**
 * Fulfillment/returns audit finding A1/A3: how long a `shipped` order must
 * sit before the buyer can report it as not received — long enough that an
 * ordinarily-late courier doesn't itself read as a dispute. Authoritative
 * enforcement is `request_return` (see `20261020020000_return_request_
 * taxonomy.sql`'s literal `interval '3 days'`); this constant is the single
 * source for the matching UI copy.
 */
export const SHIPPED_NON_DELIVERY_GRACE_DAYS = 3;

/**
 * Finding B1: how long a filed return may sit unanswered before an admin
 * may decide it directly, bypassing the seller's first-response step.
 * Authoritative enforcement is `decide_return` (see
 * `20261020030000_return_overdue_admin_escalation.sql`'s literal
 * `interval '3 days'`); kept shorter than `RETURN_WINDOW_DAYS` so the buyer
 * still has runway after an admin's decision.
 */
export const RETURN_SELLER_RESPONSE_SLA_DAYS = 3;

/**
 * Return and Refund: how long the buyer has, after the admin approves, to ship
 * the item back. Authoritative enforcement is `decide_return`'s literal
 * `interval '5 days'` (`20261023000200_decide_return_return_shipping.sql`);
 * `record_return_shipment` rejects a late submission and the 15-minute sweep
 * closes the request. This constant is the single source for UI copy.
 */
export const RETURN_SHIPBACK_DAYS = 5;

/**
 * Replacement/Exchange: a shipped replacement the buyer never confirms completes
 * by itself this many days after shipping. Authoritative enforcement is
 * `complete_overdue_replacements`'s literal `interval '7 days'`
 * (`20261023010100_replacement_shipping_and_completion.sql`); single source for UI copy.
 */
export const REPLACEMENT_AUTO_COMPLETE_DAYS = 7;

/** Non-authoritative courier suggestions only — courier is stored as free text (no courier API). Same list as `ShipmentCaptureForm`. */
export const COMMON_COURIERS = ["J&T Express", "LBC", "Ninja Van", "Flash Express", "JRS Express", "GrabExpress"];

/** Hard cap on the buyer's free-text "Other" explanation — enforced both client-side (live counter + `maxLength`) and inside `request_return` itself. */
export const RETURN_EXPLANATION_MAX_LENGTH = 500;

/**
 * The buyer's requested outcome — independent of what the seller/admin
 * actually decide (`AdminReturnDecision`/`decide_return`'s
 * `p_resolution_type`). Mirrors `public.return_request_type`.
 */
export const RETURN_REQUEST_TYPE = {
  moneyRefund: "money_refund",
  returnAndRefund: "return_and_refund",
  replacementExchange: "replacement_exchange",
} as const satisfies Record<string, ReturnRequestType>;

export const RETURN_REQUEST_TYPE_LABELS: Record<ReturnRequestType, string> = {
  money_refund: "Money Refund",
  return_and_refund: "Return and Refund",
  replacement_exchange: "Replacement/Exchange",
};

export const RETURN_REQUEST_TYPE_DESCRIPTIONS: Record<ReturnRequestType, string> = {
  money_refund: "Get your money back — no need to send anything back.",
  return_and_refund: "Ship the item back, then get refunded once the seller receives it.",
  replacement_exchange: "Get a replacement item instead of a refund.",
};

/** The structured reason category. Mirrors `public.return_reason_code`. Order here is the dropdown's display order. */
export const RETURN_REASON_CODE = {
  damagedItem: "damaged_item",
  defectiveItem: "defective_item",
  wrongItem: "wrong_item",
  missingItem: "missing_item",
  itemNotReceived: "item_not_received",
  other: "other",
} as const satisfies Record<string, ReturnReasonCode>;

export const RETURN_REASON_CODE_OPTIONS: readonly ReturnReasonCode[] = [
  "damaged_item",
  "defective_item",
  "wrong_item",
  "missing_item",
  "item_not_received",
  "other",
];

export const RETURN_REASON_CODE_LABELS: Record<ReturnReasonCode, string> = {
  damaged_item: "Damaged Item",
  defective_item: "Defective Item",
  wrong_item: "Wrong Item",
  missing_item: "Missing Item/Parts",
  item_not_received: "Item Not Received",
  other: "Other",
};

/**
 * The one reason that may be filed before an order reaches `delivered` —
 * `request_return` also accepts a `shipped` order, but only for this reason
 * and only after `SHIPPED_NON_DELIVERY_GRACE_DAYS` have passed. Every other
 * reason still requires the item to have actually arrived.
 */
export const SHIPPED_ELIGIBLE_REASON_CODE: ReturnReasonCode = "item_not_received";

/** Buyer/admin-facing names for how a COD refund was paid out. Mirrors `CodRefundMethod`. */
export const COD_REFUND_METHOD_LABELS = {
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  cash: "Cash",
} as const;
