import type { PaymentStatus, ReturnStatus } from "@/constants/status";
import type { Enums } from "@/lib/supabase/database.types";

/** The buyer-selected reason category — drives both the server-authored `reason` label and the `shipped`-order non-delivery carve-out (only `item_not_received` may be filed before `delivered`). */
export type ReturnReasonCode = Enums<"return_reason_code">;
/** The resolution the BUYER asked for. Independent of what the seller/admin actually decide — see `AdminReturnDecision`/`decide_return`'s `p_resolution_type`. */
export type ReturnRequestType = Enums<"return_request_type">;

/**
 * Domain model for one return/refund request. See `decide_return`'s doc
 * comment (`supabase/migrations/20260826000000_returns_and_refunds.sql`) for
 * the full state machine — there is no separate "admin approved" state for a
 * refund; approval and the refund are one atomic transition to `refunded`.
 * A `replacement_exchange` decision is the one exception — it moves to
 * `replacement_approved` instead, with no payment/order_status change.
 */
export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  currency: string;
  /** Fulfillment/returns audit finding B4: lets the UI warn when a COD
   * refund approval would fail because the order's cash was never recorded
   * as collected (`payment_status` still `pending`) — without weakening
   * `decide_return`'s own payment-integrity check, which stays strict. */
  orderPaymentMethod: "cod" | "xendit" | null;
  orderPaymentStatus: PaymentStatus | null;
  /** Null = whole-order return. */
  orderItemId: string | null;
  orderItemTitle: string | null;
  buyerId: string;
  buyerName: string | null;
  /** Null when the seller account has since been permanently deleted (see `admin_hard_delete_seller_account`) — the return request itself survives. */
  sellerId: string | null;
  /** Server-authored display text — a fixed label per `reasonCode`, or the buyer's own trimmed/length-checked explanation when `reasonCode` is `other`. Never client-composed. */
  reason: string;
  reasonCode: ReturnReasonCode;
  requestType: ReturnRequestType;
  /** Storage path in the payment-receipts bucket — resolve via `getReturnEvidenceSignedUrl`, never render directly. */
  evidencePath: string | null;
  status: ReturnStatus;
  sellerDecisionNote: string | null;
  sellerDecidedAt: string | null;
  adminDecisionNote: string | null;
  adminDecidedAt: string | null;
  /** Set only once the request reaches `refunded`. */
  refundAmountCents: number | null;
  /** Set once the returned item was confirmed sellable and inventory was restored (`record_return_item_condition`). Mutually exclusive with `markedUnsellableAt`; both null means the condition hasn't been recorded yet. */
  restockedAt: string | null;
  /** Set once the returned item was explicitly confirmed NOT sellable (damaged/non-resellable) — closes out the condition-check step without restocking. */
  markedUnsellableAt: string | null;
  /** Optional free-text note attached when the item's condition was recorded, either way. */
  conditionNote: string | null;
  /** Set once the seller/admin ships the replacement item (`record_return_replacement_shipment`) — only meaningful when `status` is `replacement_approved`. */
  replacementCourier: string | null;
  replacementTrackingNumber: string | null;
  replacementShippedAt: string | null;
  /** COD refunds only, set when an admin records the actual payout (`record_cod_refund_payout`). */
  codRefundMethod: "gcash" | "bank_transfer" | "cash" | null;
  codRefundReference: string | null;
  codRefundedAt: string | null;
  /** Return and Refund: when the buyer must have shipped the item back by (set on approval; the request is closed automatically after). */
  returnDeadlineAt: string | null;
  returnCourier: string | null;
  returnTrackingNumber: string | null;
  returnShippedAt: string | null;
  returnReceivedAt: string | null;
  /** What the seller found when the returned item arrived. */
  returnInspection: ReturnItemCondition | null;
  createdAt: string;
}

/** The only two outcomes `respond_to_return` accepts. */
export type SellerReturnDecision = "accept" | "reject";
/** The only two outcomes `decide_return` accepts. */
export type AdminReturnDecision = "approve" | "reject";
/** How an admin paid a COD buyer outside the app — mirrors the `return_requests_cod_refund_method_check` constraint. */
export type CodRefundMethod = "gcash" | "bank_transfer" | "cash";
/** The only two outcomes `record_return_item_condition` accepts. */
export type ReturnItemCondition = "sellable" | "not_sellable";

/**
 * Phase 5B: a Xendit refund attempt still awaiting `refund.succeeded`/
 * `refund.failed` confirmation. `return_requests.status` deliberately stays
 * `seller_accepted`/`seller_rejected` while this exists — this is the
 * explicit "pending, not yet refunded" signal the UI reads instead.
 */
export interface PendingXenditRefund {
  id: string;
  xenditPaymentRequestId: string;
  amountCents: number;
  currency: string;
}
