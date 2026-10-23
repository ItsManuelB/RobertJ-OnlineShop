import {
  getCardSessionStatus,
  getPaymentRequestStatus,
  xenditAmountToCents,
} from "@/lib/xendit/client";
import * as queries from "@/lib/supabase/queries";
import type { PaymentAttempt } from "@/features/payments/types/payment.types";

/**
 * Shared by fix #5A (reconcile before replacing a stale payment) and fix #5B
 * (reconcile before cancelling a stale payment). Deliberately a plain
 * module, not a `"use server"` action file — these are internal helpers,
 * not Server Actions, and exporting them from a `"use server"` file would
 * incorrectly expose them as directly callable actions.
 */

/** Buyer-facing message when a reconciliation check can't confirm Xendit's status. Never safe to proceed (new charge or cancellation) in this state. */
export const RECONCILIATION_RETRY_MESSAGE =
  "We're still confirming your previous payment attempt with Xendit. Please wait a moment and try again.";

/**
 * Mirrors the DB-side fix #4 staleness window (`begin_xendit_payment_attempt`
 * / `begin_xendit_group_payment_attempt` / `enforce_order_update_rules`) so
 * callers only reconcile when the DB would actually be about to treat this
 * attempt as abandoned — a still-fresh attempt needs no Xendit API call.
 * Keep this window in sync with the migration if either changes.
 */
export function isStaleXenditAttempt(attempt: PaymentAttempt): boolean {
  if (attempt.expiresAt) {
    return new Date(attempt.expiresAt).getTime() <= Date.now();
  }
  const fallbackMinutes = attempt.paymentChannel === "CARD" ? 30 : 20;
  return Date.now() - new Date(attempt.createdAt).getTime() > fallbackMinutes * 60 * 1000;
}

export type ReconciliationOutcome = "already_paid" | "cleared_for_retry" | "blocked";

/** Buyer-facing message when Checkout's "Change Payment Method" is blocked because a different channel might still resolve on its own. */
export const CHANNEL_SWITCH_BLOCKED_MESSAGE =
  "Another payment method is already in progress for this order. Wait for it to resolve, or complete that payment, before switching methods.";

/**
 * Checkout's "Change Payment Method" guard: given every OTHER channel's
 * still-pending attempts for this order/group (from
 * `getOtherFinalizedPendingXenditPayments`/`...Group...`), returns the first
 * one that isn't stale yet — i.e. might still resolve successfully on its
 * own. Starting a fresh attempt on a different channel while this exists
 * would risk both eventually succeeding (a double charge), so callers must
 * block rather than proceed. Deliberately does not reconcile on the
 * caller's behalf — a stale-but-unresolved other-channel row is left for
 * the buyer's own retry of that channel, or the nightly sweep, to resolve.
 */
export function findFreshOtherChannelAttempt(
  others: PaymentAttempt[],
): PaymentAttempt | null {
  return others.find((attempt) => !isStaleXenditAttempt(attempt)) ?? null;
}

/**
 * When the buyer lands back from Xendit's hosted page (`?xendit_return=1`),
 * ask Xendit what actually happened instead of waiting only for the webhook —
 * a webhook that is delayed, or can't reach this server at all (localhost),
 * would otherwise leave a paid order showing "Payment Pending". Reuses
 * `reconcileStaleXenditAttempt`, i.e. the same `process_xendit_webhook` RPC
 * the real webhook uses, so Xendit stays the only source of truth and nothing
 * is marked paid on the buyer's say-so. Returns null when there is no
 * finalized attempt to check; "blocked" means Xendit still says pending (or
 * could not be reached) and the page should stay as it is.
 */
export async function reconcileReturnedXenditPayment(
  order: { id: string; checkoutGroupId: string | null },
  channel: string | null,
): Promise<ReconciliationOutcome | null> {
  if (channel !== "GCASH" && channel !== "PAYMAYA" && channel !== "CARD") return null;

  const attempt = order.checkoutGroupId
    ? await queries.getFinalizedPendingXenditGroupPayment(order.checkoutGroupId, channel)
    : await queries.getFinalizedPendingXenditPayment(order.id, channel);
  if (!attempt) return null;

  return reconcileStaleXenditAttempt(
    order.checkoutGroupId ?? attempt.id,
    channel,
    attempt,
  );
}

/** Buyer-facing message when a Card form opened moments ago (or one Xendit can't confirm as unpaid) still blocks a new one. */
export const CARD_IN_PROGRESS_MESSAGE =
  "A card payment was just started for this order. Finish the form you already opened, or try again in a couple of minutes.";

/** A Card form opened less than this long ago may still be in use (same or another tab), so it is never released. */
export const CARD_ABANDON_GRACE_MS = 2 * 60 * 1000;

/**
 * Switching payment method: like `findFreshOtherChannelAttempt`, but an
 * abandoned Card form (nothing paid, confirmed with Xendit) is released first
 * so it doesn't lock the buyer out of GCash/Maya for up to 30 minutes. An
 * e-wallet attempt is never released this way — the buyer may be mid-payment
 * in the e-wallet app — so it keeps blocking until it goes stale.
 */
export async function findBlockingOtherChannelAttempt(
  others: PaymentAttempt[],
  referenceIdFor: (attempt: PaymentAttempt) => string,
): Promise<PaymentAttempt | null> {
  for (const attempt of others) {
    if (isStaleXenditAttempt(attempt)) continue;
    if (attempt.paymentChannel === "CARD") {
      const released = await releaseAbandonedCardAttempt(referenceIdFor(attempt), attempt);
      if (released === "cleared_for_retry") continue;
    }
    return attempt;
  }
  return null;
}

/**
 * Retry of a Card payment while the previous session isn't stale yet. The
 * session is created when the form opens, so a buyer who leaves without paying
 * would otherwise be locked out until it expires. Past a short grace period we
 * ask Xendit first: a completed/expired/cancelled session is applied as usual
 * (never overwrites a real payment), and only a session Xendit still reports
 * ACTIVE (nothing paid) is marked abandoned so a fresh form can start.
 * "blocked" covers both "within the grace period" and "Xendit unreachable".
 */
export async function releaseAbandonedCardAttempt(
  referenceId: string,
  existing: PaymentAttempt,
): Promise<ReconciliationOutcome> {
  if (!existing.xenditPaymentRequestId) return "cleared_for_retry";
  if (Date.now() - new Date(existing.createdAt).getTime() < CARD_ABANDON_GRACE_MS) return "blocked";

  let session: Awaited<ReturnType<typeof getCardSessionStatus>>;
  try {
    session = await getCardSessionStatus(existing.xenditPaymentRequestId);
  } catch {
    return "blocked";
  }
  if (session.status !== "ACTIVE") return reconcileStaleXenditAttempt(referenceId, "CARD", existing);

  try {
    const released = await queries.reconcileXenditWebhookStatus({
      referenceId,
      xenditPaymentRequestId: existing.xenditPaymentRequestId,
      xenditPaymentId: session.payment_id ?? "",
      status: "CANCELED",
      channelCode: "CARD",
      amountCents:
        typeof session.amount === "number" ? xenditAmountToCents(session.amount) : existing.amountCents,
      currency: session.currency ?? existing.currency,
    });
    return released?.status === "failed" ? "cleared_for_retry" : "blocked";
  } catch {
    return "blocked";
  }
}

/**
 * Before a stale-by-our-clock attempt is treated as abandoned -- whether
 * that means starting a fresh charge (fix #5A) or allowing the order to be
 * cancelled (fix #5B) -- ask Xendit directly what actually happened. Xendit's
 * answer is applied through `reconcileXenditWebhookStatus`, which is the
 * exact same `process_xendit_webhook` RPC the real webhook uses -- no
 * payment-status logic is duplicated here. `referenceId` is the payment
 * row's own id for a single order, or the `checkoutGroupId` for a combined
 * group payment -- matching whichever value was originally sent to Xendit
 * as `reference_id`.
 */
export async function reconcileStaleXenditAttempt(
  referenceId: string,
  channelCode: "GCASH" | "PAYMAYA" | "CARD",
  existing: PaymentAttempt,
): Promise<ReconciliationOutcome> {
  if (!existing.xenditPaymentRequestId) return "cleared_for_retry";

  let rawStatus: string;
  let amountCents = existing.amountCents;
  let currency = existing.currency;
  let xenditPaymentId = "";

  try {
    if (channelCode === "CARD") {
      const session = await getCardSessionStatus(existing.xenditPaymentRequestId);
      // Session-level "COMPLETED" is normalized to the payment-level
      // "SUCCEEDED" process_xendit_webhook expects — the exact status
      // vocabulary Xendit uses for a completed Card session is unconfirmed
      // against a live sandbox response (see client.ts), so this mapping is
      // defensive, not a guarantee. Any other session status (ACTIVE,
      // EXPIRED, CANCELED, or unrecognized) passes through unchanged.
      rawStatus = session.status === "COMPLETED" ? "SUCCEEDED" : session.status;
      if (typeof session.amount === "number") amountCents = xenditAmountToCents(session.amount);
      if (session.currency) currency = session.currency;
      if (session.payment_id) xenditPaymentId = session.payment_id;
    } else {
      const request = await getPaymentRequestStatus(existing.xenditPaymentRequestId);
      rawStatus = request.status;
      if (typeof request.request_amount === "number") {
        amountCents = xenditAmountToCents(request.request_amount);
      }
      if (request.currency) currency = request.currency;
      if (request.payment_id) xenditPaymentId = request.payment_id;
    }
  } catch {
    // Network error, timeout, non-2xx from Xendit — never safe to assume
    // abandonment from a failed status check.
    return "blocked";
  }

  let reconciled: PaymentAttempt | null;
  try {
    reconciled = await queries.reconcileXenditWebhookStatus({
      referenceId,
      xenditPaymentRequestId: existing.xenditPaymentRequestId,
      xenditPaymentId,
      status: rawStatus,
      channelCode,
      amountCents,
      currency,
    });
  } catch {
    return "blocked";
  }

  if (reconciled?.status === "paid") return "already_paid";
  if (reconciled?.status === "failed") return "cleared_for_retry";
  // Anything else (still pending/processing on Xendit's side, or an
  // unrecognized status process_xendit_webhook logged as
  // ignored_transient_status) -- never safe to proceed while the existing
  // attempt might still resolve successfully.
  return "blocked";
}
