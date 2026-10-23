/** Mirrors `_cancellation_refund_state()` in the database (camelCased by the mapper in queries.ts). */
export type CancellationRefundKind = "none" | "xendit" | "manual";

export type CancellationRefundAttemptStatus = "pending" | "succeeded" | "failed";

export interface CancellationRefundState {
  kind: CancellationRefundKind;
  returnRequestId: string | null;
  /** `return_requests.status`: seller_accepted (Xendit in flight/failed), refund_due (staff payout), refunded. */
  returnStatus: string | null;
  refundId: string | null;
  refundStatus: CancellationRefundAttemptStatus | null;
  failureCode: string | null;
  amountCents: number | null;
  currency: string | null;
  /** A pending Xendit attempt exists that has not been sent to Xendit yet. */
  needsSubmission: boolean;
}

export const NO_CANCELLATION_REFUND: CancellationRefundState = {
  kind: "none",
  returnRequestId: null,
  returnStatus: null,
  refundId: null,
  refundStatus: null,
  failureCode: null,
  amountCents: null,
  currency: null,
  needsSubmission: false,
};

export interface OrderCancellationResult {
  orderId: string;
  alreadyCancelled: boolean;
  refund: CancellationRefundState;
}

export type CancellationRequestStatus = "pending" | "approved" | "rejected" | "expired";

export interface CancellationRequest {
  id: string;
  orderId: string;
  reason: string;
  status: CancellationRequestStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type CancellationResponseOutcome = "approved" | "rejected" | "expired";

export interface CancellationResponseResult {
  outcome: CancellationResponseOutcome;
  orderId: string;
  alreadyDecided: boolean;
  refund: CancellationRefundState;
}

/** What the buyer/seller sees about a cancellation refund. */
export type RefundStage = "none" | "processing" | "completed" | "needs_attention" | "manual_pending";

export interface RefundPresentation {
  stage: RefundStage;
  headline: string;
  detail: string;
  destination: string | null;
  timeframe: string | null;
}
