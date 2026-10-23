import * as queries from "@/lib/supabase/queries";
import { createRefund } from "@/lib/xendit/client";
import type { Json } from "@/lib/supabase/database.types";
import { reconcileXenditRefund } from "@/features/payments/lib/xendit-refund-reconciliation";

/**
 * Sends the automatic refunds a cancellation opened (`xendit_refunds` rows still
 * `pending` with no Xendit id) to Xendit, the same `POST /refunds` call
 * `decideReturnAction` makes. The database already decided that the refund is
 * owed and for how much; this only performs the outbound call.
 *
 * Safe to run twice at once (a buyer's double click, the action racing the
 * sweep): the attempt's own id is the Idempotency-Key, so Xendit returns the
 * same refund, and `system_record_xendit_refund_submission` only fills the id in
 * once. A call that fails marks the attempt `failed` (`submission_error`) so it
 * stays visible, can be retried, and never leaves a refund silently unsent.
 * Nothing is trusted as "refunded" here — only the refund webhook / status sync
 * (`reconcileXenditRefund`) settles an attempt.
 */
export async function submitXenditRefund(refund: queries.UnsubmittedXenditRefund): Promise<boolean> {
  try {
    const response = await createRefund({
      paymentRequestId: refund.xenditPaymentRequestId,
      amountCents: refund.amountCents,
      currency: refund.currency,
      reason: "CANCELLATION",
      idempotencyKey: refund.id,
    });
    await queries.systemRecordXenditRefundSubmission(refund.id, response.id, response as unknown as Json);
    // Ask Xendit for the real status right away (best-effort; the webhook and
    // the 15-minute sweep still settle it if this can't).
    await reconcileXenditRefund(response.id);
    return true;
  } catch (error) {
    console.error("[cancellation refund] submission to Xendit failed", { refundId: refund.id, error });
    try {
      await queries.systemFailXenditRefundSubmission(
        refund.id,
        error instanceof Error ? error.message : "Xendit refund request failed.",
      );
    } catch (markError) {
      console.error("[cancellation refund] could not record the failure", { refundId: refund.id, markError });
    }
    return false;
  }
}

/** Submits every unsent cancellation refund on one order. Returns how many were sent. */
export async function submitCancellationRefundsForOrder(orderId: string): Promise<number> {
  let sent = 0;
  const pending = await queries.getUnsubmittedXenditRefunds({ orderId });
  for (const refund of pending) {
    if (await submitXenditRefund(refund)) sent += 1;
  }
  return sent;
}

/**
 * Best-effort wrapper for callers that must not fail just because the refund
 * hand-off did: the cancellation is already committed, and the pending attempt
 * stays in the database for the sweep to pick up.
 */
export async function submitCancellationRefundsSafely(orderId: string): Promise<void> {
  try {
    await submitCancellationRefundsForOrder(orderId);
  } catch (error) {
    console.error("[cancellation refund] hand-off failed; the sweep will retry", { orderId, error });
  }
}

/**
 * Sends every cancellation refund that is still unsent (webhook late-payment
 * path and the reconciliation sweep). `minAgeMinutes` leaves brand-new ones to
 * the request that just created them. Returns how many were sent.
 */
export async function submitUnsubmittedRefunds(minAgeMinutes?: number, limit = 20): Promise<number> {
  let sent = 0;
  const pending = await queries.getUnsubmittedXenditRefunds({ minAgeMinutes, limit });
  for (const refund of pending) {
    if (await submitXenditRefund(refund)) sent += 1;
  }
  return sent;
}

/**
 * Sweep step: re-opens refunds whose submission to Xendit failed on our side
 * (bounded attempts, enforced in the database) so they are retried without a
 * human, then submits everything unsent.
 */
export async function recoverCancellationRefunds(): Promise<{ retried: number; submitted: number }> {
  let retried = 0;
  const failed = await queries.getCancellationRefundsWithSubmissionErrors(20);
  for (const returnRequestId of failed) {
    if (await queries.systemRetryCancellationRefund(returnRequestId)) retried += 1;
  }
  const submitted = await submitUnsubmittedRefunds(2);
  return { retried, submitted };
}
