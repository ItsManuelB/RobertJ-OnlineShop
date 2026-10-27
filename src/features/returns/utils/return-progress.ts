import { RETURN_STATUS } from "@/constants/status";
import { RETURN_SELLER_RESPONSE_SLA_DAYS } from "@/features/returns/constants/return.constants";
import type { ReturnRequest } from "@/features/returns/types/return.types";

/** The stages every request passes through, whichever resolution was asked for. */
export const RETURN_PROGRESS_STEPS = [
  "Requested",
  "Seller response",
  "Admin decision",
  "Return or replacement",
  "Closed",
] as const;

export type ReturnActor = "buyer" | "seller" | "admin";

export interface ReturnProgress {
  /** Index into `RETURN_PROGRESS_STEPS` of the stage in progress; equals the step count once everything is done. */
  current: number;
  /** Who has to act next; null when the request is closed. */
  waitingOn: ReturnActor | null;
}

const ALL_DONE = RETURN_PROGRESS_STEPS.length;

/** Maps a request's status to its stage and the party it is waiting on. Mirrors `sellerReturnBucket` for who acts. */
export function getReturnProgress(request: ReturnRequest): ReturnProgress {
  switch (request.status) {
    case RETURN_STATUS.pending:
      return { current: 1, waitingOn: "seller" };
    case RETURN_STATUS.sellerAccepted:
    case RETURN_STATUS.sellerRejected:
      return { current: 2, waitingOn: "admin" };
    case RETURN_STATUS.awaitingReturn:
      return { current: 3, waitingOn: "buyer" };
    case RETURN_STATUS.returnShipped:
      return { current: 3, waitingOn: "seller" };
    case RETURN_STATUS.returnReceived:
    case RETURN_STATUS.refundDue:
      return { current: 3, waitingOn: "admin" };
    case RETURN_STATUS.replacementApproved:
      return { current: 3, waitingOn: "seller" };
    case RETURN_STATUS.replacementShipped:
      return { current: 3, waitingOn: "buyer" };
    case RETURN_STATUS.refunded:
      // Refunded, but the item's condition still has to be recorded by the seller.
      return !request.restockedAt && !request.markedUnsellableAt
        ? { current: 3, waitingOn: "seller" }
        : { current: ALL_DONE, waitingOn: null };
    default:
      return { current: ALL_DONE, waitingOn: null };
  }
}

export interface ResponseDeadline {
  label: string;
  /** Due tomorrow or sooner (including overdue) — worth drawing the eye. */
  urgent: boolean;
}

/**
 * How long the seller has left to answer a still-pending request, from the
 * existing response window. Information only: nothing is decided or escalated
 * by this. `elapsedDays` is whole days since the request was filed.
 */
export function getResponseDeadline(elapsedDays: number): ResponseDeadline {
  const left = RETURN_SELLER_RESPONSE_SLA_DAYS - elapsedDays;
  if (left < 0) {
    const late = -left;
    return { label: `Overdue by ${late} day${late === 1 ? "" : "s"}`, urgent: true };
  }
  if (left === 0) return { label: "Respond today", urgent: true };
  if (left === 1) return { label: "Respond by tomorrow", urgent: true };
  return { label: `Respond within ${left} days`, urgent: false };
}
