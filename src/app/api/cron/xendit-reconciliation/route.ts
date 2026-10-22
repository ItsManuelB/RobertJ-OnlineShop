import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/config/env";
import * as queries from "@/lib/supabase/queries";
import { reconcileXenditRefund } from "@/features/payments/lib/xendit-refund-reconciliation";
import {
  isStaleXenditAttempt,
  reconcileStaleXenditAttempt,
} from "@/features/payments/lib/xendit-reconciliation";

/**
 * Phase #4A: passive reconciliation sweep for Xendit payments left "pending"
 * with nobody left to trigger fix #5A/#5B's synchronous reconciliation — the
 * buyer never returns to retry or cancel, so the attempt would otherwise sit
 * stale forever. Triggered by Vercel Cron (see `vercel.json`); reuses the
 * exact fix #5A/#5B building blocks (`isStaleXenditAttempt`,
 * `reconcileStaleXenditAttempt`) so no payment-status logic is duplicated.
 *
 * This route NEVER creates or charges anything — it only asks Xendit for the
 * real status of an already-finalized attempt and applies it through the
 * same `process_xendit_webhook` RPC the real webhook and fix #5A/#5B use.
 * COD is out of scope by construction: `getStaleXenditPaymentsForReconciliationSweep`
 * only reads `payment_method_type = 'xendit'` rows.
 *
 * TD-9: after the payment-status sweep above, a second pass auto-expires
 * orders that are still unpaid 60 minutes after placement — see `runExpirySweep`.
 * Deliberately the SAME cron/route (not a second scheduled job): it runs
 * every 15 minutes (see netlify/functions/xendit-reconciliation.mts), which
 * is fine granularity for a 60-minute threshold, and it means one schedule
 * to reason about instead of two.
 */

/** Oldest-first raw rows to consider per run — bounds the query, not the work actually done (see queries.ts docs). */
const FETCH_LIMIT = 200;
/** Hard cap on how many stale candidates are actually reconciled (i.e. call Xendit) per run, regardless of how many were fetched. */
const BATCH_LIMIT = 20;

/** How long an unpaid online-payment order may sit before it's auto-cancelled. Business-set threshold, not inferred. */
const EXPIRE_THRESHOLD_MINUTES = 60;
/** Oldest-first raw order rows to consider per run. */
const EXPIRE_FETCH_LIMIT = 200;
/** Hard cap on how many orders are actually expired (i.e. potentially call Xendit + write a cancellation) per run. */
const EXPIRE_BATCH_LIMIT = 20;

/** Leave a refund this long to its webhook before the sweep asks Xendit. */
const REFUND_MIN_AGE_MINUTES = 5;
/** Max pending refunds checked per run (each is one Xendit call). */
const REFUND_BATCH_LIMIT = 20;

interface SweepSummary {
  candidatesFetched: number;
  reconciled: number;
  alreadyPaid: number;
  clearedForRetry: number;
  blocked: number;
  skippedNotStale: number;
  errors: number;
}

interface ExpirySweepSummary {
  candidatesFetched: number;
  expired: number;
  stillResolvable: number;
  errors: number;
}

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const expected = env.CRON_SECRET;
  const provided = request.headers.get("authorization");

  if (!expected || !isAuthorized(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let candidates: Awaited<ReturnType<typeof queries.getStaleXenditPaymentsForReconciliationSweep>>;
  try {
    candidates = await queries.getStaleXenditPaymentsForReconciliationSweep(FETCH_LIMIT);
  } catch (error) {
    console.error("[xendit reconciliation sweep] failed to load candidates", error);
    return NextResponse.json({ error: "Failed to load candidates" }, { status: 500 });
  }

  const summary: SweepSummary = {
    candidatesFetched: candidates.length,
    reconciled: 0,
    alreadyPaid: 0,
    clearedForRetry: 0,
    blocked: 0,
    skippedNotStale: 0,
    errors: 0,
  };

  for (const candidate of candidates) {
    if (summary.reconciled >= BATCH_LIMIT) break;

    if (!isStaleXenditAttempt(candidate.attempt)) {
      summary.skippedNotStale++;
      continue;
    }

    summary.reconciled++;
    try {
      const outcome = await reconcileStaleXenditAttempt(
        candidate.referenceId,
        candidate.channelCode,
        candidate.attempt,
      );
      if (outcome === "already_paid") summary.alreadyPaid++;
      else if (outcome === "cleared_for_retry") summary.clearedForRetry++;
      else summary.blocked++;
    } catch (error) {
      // reconcileStaleXenditAttempt already catches its own Xendit/RPC
      // failures and returns "blocked" rather than throwing. This guard is
      // defense-in-depth only: one candidate erroring unexpectedly must
      // never abort the sweep for the rest of the batch.
      summary.errors++;
      console.error("[xendit reconciliation sweep] candidate failed", {
        referenceId: candidate.referenceId,
        channelCode: candidate.channelCode,
        error,
      });
    }
  }

  const expiry = await runExpirySweep();
  const refunds = await runRefundSweep();
  const returns = await runReturnExpirySweep();

  return NextResponse.json({ received: true, ...summary, expiry, refunds, returns });
}

/**
 * Closes Return and Refund requests the buyer never shipped back in time
 * (`awaiting_return` past `return_deadline_at` -> `return_expired`). Nothing was
 * refunded at that point, so there is nothing to undo.
 */
async function runReturnExpirySweep(): Promise<{ expired: number; errors: number }> {
  try {
    return { expired: await queries.expireOverdueReturnRequests(), errors: 0 };
  } catch (error) {
    console.error("[return expiry sweep] failed", error);
    return { expired: 0, errors: 1 };
  }
}

/**
 * Catch-up for refunds Xendit accepted but whose `refund.*` webhook never
 * settled: asks Xendit for the real status and applies it through the same
 * RPC the webhook uses (see `reconcileXenditRefund`). Never creates or
 * retries a refund.
 */
async function runRefundSweep(): Promise<{ checked: number; settled: number; errors: number }> {
  const summary = { checked: 0, settled: 0, errors: 0 };
  let pending: Awaited<ReturnType<typeof queries.getPendingXenditRefundsForSweep>>;
  try {
    pending = await queries.getPendingXenditRefundsForSweep(REFUND_MIN_AGE_MINUTES, REFUND_BATCH_LIMIT);
  } catch (error) {
    console.error("[xendit refund sweep] failed to load pending refunds", error);
    summary.errors++;
    return summary;
  }

  for (const refund of pending) {
    summary.checked++;
    if ((await reconcileXenditRefund(refund.xenditRefundId)) === "settled") summary.settled++;
  }
  return summary;
}

/**
 * TD-9: cancels orders that are `payment_method = 'xendit'`, still
 * `order_status = 'pending'`, and still unpaid `EXPIRE_THRESHOLD_MINUTES`
 * after `placed_at`. Before cancelling, always re-checks Xendit's real
 * status first (reusing the exact same reconciliation building blocks the
 * pre-cancellation guard uses) so an order Xendit still considers payable is
 * never touched — an order with no payment attempt at all has nothing to
 * reconcile and is safe to expire directly once past the threshold. The
 * actual cancellation goes through `expire_unpaid_xendit_order`, the same
 * `order_status = 'cancelled'` transition every other cancellation path
 * uses, so `orders_restock_on_cancel` restocks it exactly as it does today —
 * no parallel restock mechanism.
 */
async function runExpirySweep(): Promise<ExpirySweepSummary> {
  const summary: ExpirySweepSummary = {
    candidatesFetched: 0,
    expired: 0,
    stillResolvable: 0,
    errors: 0,
  };

  let candidates: Awaited<ReturnType<typeof queries.getAbandonedXenditOrdersForExpiry>>;
  try {
    candidates = await queries.getAbandonedXenditOrdersForExpiry(
      EXPIRE_THRESHOLD_MINUTES,
      EXPIRE_FETCH_LIMIT,
    );
  } catch (error) {
    console.error("[xendit expiry sweep] failed to load candidates", error);
    return summary;
  }
  summary.candidatesFetched = candidates.length;

  for (const candidate of candidates) {
    if (summary.expired + summary.stillResolvable >= EXPIRE_BATCH_LIMIT) break;

    try {
      const attempts = await queries.getFinalizedPendingXenditAttemptsForOrderAdmin(
        candidate.orderId,
        candidate.checkoutGroupId,
      );

      let stillResolvable = false;
      for (const attempt of attempts) {
        // A not-yet-stale attempt (by its own 20/30-min window) might still
        // resolve on its own — never expire an order while one exists,
        // mirroring blockCancellationIfXenditUnresolved's exact reasoning.
        if (!isStaleXenditAttempt(attempt.attempt)) {
          stillResolvable = true;
          break;
        }

        const outcome = await reconcileStaleXenditAttempt(
          attempt.referenceId,
          attempt.channelCode,
          attempt.attempt,
        );
        // "already_paid": the order was actually paid — never auto-cancel a
        // paid order (unlike a buyer's own deliberate cancel, this is
        // automated and must never discard a real payment). "blocked":
        // ambiguous/network error — retry next run. Both leave the order
        // untouched. Only "cleared_for_retry" (Xendit confirms it's
        // genuinely not paid) lets the loop continue checking any other
        // channel's attempt before this order is considered safe to expire.
        if (outcome !== "cleared_for_retry") {
          stillResolvable = true;
          break;
        }
      }

      if (stillResolvable) {
        summary.stillResolvable++;
        continue;
      }

      await queries.expireAbandonedXenditOrder(candidate.orderId);
      summary.expired++;
    } catch (error) {
      summary.errors++;
      console.error("[xendit expiry sweep] candidate failed", {
        orderId: candidate.orderId,
        orderNumber: candidate.orderNumber,
        error,
      });
    }
  }

  return summary;
}

function isAuthorized(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const expectedHeader = `Bearer ${expected}`;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expectedHeader);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
