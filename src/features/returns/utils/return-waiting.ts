// Type-only import on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.
import type { ReturnRequest } from "../types/return.types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type WaitingActor = "buyer" | "seller" | "admin";

/** The fields `getReturnWaiting` reads, so tests can pass a plain object. */
export type WaitingInput = Pick<
  ReturnRequest,
  | "status"
  | "createdAt"
  | "sellerDecidedAt"
  | "adminDecidedAt"
  | "returnShippedAt"
  | "returnReceivedAt"
  | "replacementShippedAt"
  | "codRefundedAt"
  | "restockedAt"
  | "markedUnsellableAt"
>;

export interface ReturnWaiting {
  actor: WaitingActor;
  /** When the request started waiting on `actor`. */
  since: string;
}

/** How many whole days `actor` is allowed before the case is flagged as late. Display only: nothing is decided or escalated by it. */
export interface WaitingTargets {
  admin: number;
  seller: number;
}

export interface WaitingStatus {
  actor: WaitingActor;
  days: number;
  pastTarget: boolean;
}

/**
 * Who a request is waiting on and since when, or null when nobody is (closed,
 * or a refund already submitted to the payment provider). Only uses timestamps
 * the request already carries, so it needs no new column. Mirrors the status
 * map in `getReturnProgress`, which says who acts but not for how long.
 */
export function getReturnWaiting(request: WaitingInput): ReturnWaiting | null {
  switch (request.status) {
    case "pending":
      return { actor: "seller", since: request.createdAt };

    case "seller_accepted":
    case "seller_rejected":
      // The admin already approved and a Xendit refund is in flight: nothing is waiting on a person.
      if (request.adminDecidedAt) return null;
      return request.sellerDecidedAt ? { actor: "admin", since: request.sellerDecidedAt } : null;

    case "return_received": {
      if (!request.returnReceivedAt) return null;
      // The admin's refund approval stamps `admin_decided_at` again, after receipt.
      if (request.adminDecidedAt && request.adminDecidedAt > request.returnReceivedAt) return null;
      return { actor: "admin", since: request.returnReceivedAt };
    }

    case "refund_due":
      return request.adminDecidedAt ? { actor: "admin", since: request.adminDecidedAt } : null;

    case "awaiting_return":
      return request.adminDecidedAt ? { actor: "buyer", since: request.adminDecidedAt } : null;

    case "return_shipped":
      return request.returnShippedAt ? { actor: "seller", since: request.returnShippedAt } : null;

    case "replacement_approved":
      return !request.replacementShippedAt && request.adminDecidedAt
        ? { actor: "seller", since: request.adminDecidedAt }
        : null;

    case "replacement_shipped":
      return request.replacementShippedAt ? { actor: "buyer", since: request.replacementShippedAt } : null;

    case "refunded": {
      // Money is out; the seller still has to record whether the item can be sold again.
      if (request.restockedAt || request.markedUnsellableAt) return null;
      const since = request.codRefundedAt ?? request.adminDecidedAt;
      return since ? { actor: "seller", since } : null;
    }

    default:
      return null;
  }
}

/** Whole days between `sinceIso` and `now`, never negative. */
export function waitingDays(sinceIso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / DAY_MS));
}

/** `getReturnWaiting` plus the elapsed days and whether the actor is past their target. The buyer has no target here: their deadlines are enforced elsewhere. */
export function getWaitingStatus(
  request: WaitingInput,
  targets: WaitingTargets,
  now: number = Date.now(),
): WaitingStatus | null {
  const waiting = getReturnWaiting(request);
  if (!waiting) return null;
  const days = waitingDays(waiting.since, now);
  const target = waiting.actor === "admin" ? targets.admin : waiting.actor === "seller" ? targets.seller : null;
  return { actor: waiting.actor, days, pastTarget: target !== null && days >= target };
}
