"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { publicEnv } from "@/config/env";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import { createEwalletPaymentRequest, createCardPaymentSession } from "@/lib/xendit/client";
import type { ActionResult } from "@/types/action.types";
import {
  CARD_IN_PROGRESS_MESSAGE,
  CHANNEL_SWITCH_BLOCKED_MESSAGE,
  RECONCILIATION_RETRY_MESSAGE,
  findBlockingOtherChannelAttempt,
  isStaleXenditAttempt,
  reconcileReturnedXenditPayment,
  reconcileStaleXenditAttempt,
  releaseAbandonedCardAttempt,
} from "@/features/payments/lib/xendit-reconciliation";
import {
  confirmXenditPaymentSchema,
  createXenditCardSessionSchema,
  createXenditEwalletPaymentSchema,
  createXenditGroupCardSessionSchema,
  createXenditGroupEwalletPaymentSchema,
} from "@/features/payments/schemas/xendit.schema";

/**
 * Buyer starts (or resumes) a GCash/Maya payment for one of their own
 * pending orders. `beginXenditPaymentAttempt` idempotently reserves the
 * attempt (double-click/retry safe at the DB layer); Xendit's own
 * `Idempotency-Key` (the same `payments.id`) is a second layer of
 * protection against duplicate requests on the Xendit side.
 *
 * The buyer is redirected straight to Xendit's hosted checkout — this
 * Server Action never marks anything paid. Only the webhook
 * (`process_xendit_webhook`) does that.
 */
export async function createXenditEwalletPaymentAction(
  orderId: string,
  channelCode: "GCASH" | "PAYMAYA",
): Promise<ActionResult<null>> {
  const parsed = createXenditEwalletPaymentSchema.safeParse({ orderId, channelCode });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await queries.requireSessionUser();
  const order = await queries.getBuyerOrder(parsed.data.orderId, user.id);
  if (!order) return fail("Order not found.");

  const existingAttempt = await queries.getFinalizedPendingXenditPayment(
    parsed.data.orderId,
    parsed.data.channelCode,
  );
  if (existingAttempt && isStaleXenditAttempt(existingAttempt)) {
    const reconciliation = await reconcileStaleXenditAttempt(
      existingAttempt.id,
      parsed.data.channelCode,
      existingAttempt,
    );
    if (reconciliation === "blocked") return fail(RECONCILIATION_RETRY_MESSAGE);
    if (reconciliation === "already_paid") {
      redirect(`${ROUTES.orderDetail(parsed.data.orderId)}?xendit_return=1`);
    }
    // "cleared_for_retry": the old attempt is now genuinely failed/expired —
    // fall through, beginXenditPaymentAttempt will correctly start a fresh one.
  }

  // Checkout's "Change Payment Method": block starting THIS channel while a
  // DIFFERENT channel still has a live attempt that might resolve on its
  // own — never blindly start a second channel (see
  // docs/payment-ux-architecture-audit.md §6-7).
  const otherAttempts = await queries.getOtherFinalizedPendingXenditPayments(
    parsed.data.orderId,
    parsed.data.channelCode,
  );
  if (await findBlockingOtherChannelAttempt(otherAttempts, (a) => a.id)) return fail(CHANNEL_SWITCH_BLOCKED_MESSAGE);

  let redirectUrl: string;
  try {
    const attempt = await queries.beginXenditPaymentAttempt(
      parsed.data.orderId,
      parsed.data.channelCode,
    );

    // Already confirmed with Xendit and still valid — resume instead of
    // creating a duplicate payment request.
    if (attempt.xenditPaymentRequestId && attempt.checkoutUrl) {
      redirectUrl = attempt.checkoutUrl;
    } else {
      // Bounces back into Checkout's payment workspace, never Orders — the
      // only place buyer payment initiation/retry is allowed to happen.
      const returnUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${ROUTES.checkoutResume(parsed.data.orderId)}?xendit_return=1`;
      const response = await createEwalletPaymentRequest({
        referenceId: attempt.id,
        channelCode: parsed.data.channelCode,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        successReturnUrl: returnUrl,
        failureReturnUrl: returnUrl,
        // Xendit's inline `customer` object (PAYMAYA only — see
        // createEwalletPaymentRequest) is a one-time create call: reusing
        // the same reference_id across separate attempts is rejected as
        // "already used" on the second attempt — the exact same behavior
        // already fixed for Card sessions below. `attempt.id` is a fresh
        // payments row per attempt, so it's unique every time; the buyer's
        // stable `user.id` is not. GCash is unaffected either way — it
        // never sends a customer object.
        customer: { id: attempt.id, givenNames: user.fullName || user.email },
      });

      const action = response.actions?.find((a) => a.type === "REDIRECT_CUSTOMER");
      if (!action?.value) {
        await queries.finalizeXenditPaymentRequest({
          paymentId: attempt.id,
          xenditPaymentRequestId: response.payment_request_id,
          checkoutUrl: "",
          expiresAt: null,
          status: "failed",
        });
        return fail("Xendit did not return a checkout link. Please try again.");
      }

      const finalized = await queries.finalizeXenditPaymentRequest({
        paymentId: attempt.id,
        xenditPaymentRequestId: response.payment_request_id,
        checkoutUrl: action.value,
        expiresAt: null,
      });
      redirectUrl = finalized.checkoutUrl ?? action.value;
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not start this payment.");
  }

  redirect(redirectUrl);
}

/**
 * Buyer starts a Card payment session. Returns a short-lived
 * `components_sdk_key` for the client-side Components widget to mount —
 * the secret API key never leaves the server, and raw card data never
 * reaches it either. The webhook, not this action, confirms payment.
 */
export async function createXenditCardSessionAction(
  orderId: string,
): Promise<ActionResult<{ paymentId: string; componentsSdkKey: string }>> {
  const parsed = createXenditCardSessionSchema.safeParse({ orderId });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await queries.requireSessionUser();
  const order = await queries.getBuyerOrder(parsed.data.orderId, user.id);
  if (!order) return fail("Order not found.");

  const existingAttempt = await queries.getFinalizedPendingXenditPayment(parsed.data.orderId, "CARD");
  if (existingAttempt) {
    if (isStaleXenditAttempt(existingAttempt)) {
      const reconciliation = await reconcileStaleXenditAttempt(existingAttempt.id, "CARD", existingAttempt);
      if (reconciliation === "blocked") return fail(RECONCILIATION_RETRY_MESSAGE);
      if (reconciliation === "already_paid") {
        return fail("This order has already been paid. Refresh the page to see the updated status.");
      }
      // "cleared_for_retry": fall through — beginXenditPaymentAttempt will
      // start a genuinely fresh attempt (new payments.id => new Xendit
      // idempotency key => a real new Card session, not the stale one).
    } else {
      // Still fresh (not stale): a second session for this same attempt
      // would reuse its already-registered customer.reference_id (see the
      // `customer` field below) and fail. Confirmed live against Xendit's
      // sandbox: calling POST /sessions twice with the same
      // customer.reference_id returns 409 DUPLICATE_ERROR ("The
      // reference_id entered has been used before"), even with an
      // identical Idempotency-Key. So a new session needs a new attempt:
      // release the old one only if Xendit confirms nothing was paid and
      // the form isn't recent; otherwise stop with a clear message.
      const released = await releaseAbandonedCardAttempt(existingAttempt.id, existingAttempt);
      if (released === "already_paid") {
        return fail("This order has already been paid. Refresh the page to see the updated status.");
      }
      if (released !== "cleared_for_retry") return fail(CARD_IN_PROGRESS_MESSAGE);
    }
  }

  // Checkout's "Change Payment Method": same cross-channel guard as the
  // e-wallet action above — block starting Card while GCash/Maya might
  // still resolve on its own.
  const otherAttempts = await queries.getOtherFinalizedPendingXenditPayments(parsed.data.orderId, "CARD");
  if (await findBlockingOtherChannelAttempt(otherAttempts, (a) => a.id)) return fail(CHANNEL_SWITCH_BLOCKED_MESSAGE);

  let attempt: Awaited<ReturnType<typeof queries.beginXenditPaymentAttempt>> | undefined;
  try {
    // Card sessions carry a short-lived components_sdk_key that can't be
    // meaningfully reused across requests, so every call here mints a
    // fresh Xendit session — safe only because the guard above already
    // ruled out a still-valid existing session for this exact attempt.
    // Still reserved against the same idempotently-reserved `payments`
    // row either way, so no duplicate row is ever created for one intent.
    attempt = await queries.beginXenditPaymentAttempt(parsed.data.orderId, "CARD");

    // Bounces back into Checkout's payment workspace, never Orders — the
    // only place buyer payment initiation/retry is allowed to happen.
    const returnUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${ROUTES.checkoutResume(parsed.data.orderId)}?xendit_return=1`;
    const session = await createCardPaymentSession({
      referenceId: attempt.id,
      amountCents: attempt.amountCents,
      currency: attempt.currency,
      successReturnUrl: returnUrl,
      cancelReturnUrl: returnUrl,
      // Xendit treats an inlined `customer` object on /sessions as a
      // one-time create call: reusing the same reference_id across separate
      // Card attempts (e.g. the buyer's own stable user.id) is rejected as
      // "already used" on the second attempt. attempt.id is a fresh payments
      // row per Card attempt, so it's unique every time. Card-only — GCash
      // and Maya still use user.id, unaffected by this change.
      customer: { id: attempt.id, givenNames: user.fullName || user.email },
    });

    await queries.finalizeXenditPaymentRequest({
      paymentId: attempt.id,
      xenditPaymentRequestId: session.payment_session_id,
      checkoutUrl: returnUrl,
      // Xendit's Sessions API returns a real expiry (documented default: 30
      // minutes after creation) — stored as-is so staleness checks can rely
      // on it instead of falling back to an approximated window.
      expiresAt: session.expires_at ?? null,
    });

    return ok({ paymentId: attempt.id, componentsSdkKey: session.components_sdk_key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start this payment.";
    // Forensic capture for the next occurrence of a Card session-creation
    // failure (see docs/xendit-multishop-card-payment-failure-audit.md root
    // cause #2) — only possible once the attempt row itself exists; a
    // failure before that point (e.g. beginXenditPaymentAttempt's own RPC
    // call) has no payment_id to log against and is DB-side, not a Xendit
    // API failure anyway.
    if (attempt) {
      await queries.logXenditCardSessionFailure(attempt.id, message);
    }
    return fail(message);
  }
}

/**
 * Combined-payment counterpart of `createXenditEwalletPaymentAction` for a
 * multi-seller checkout: takes only the server-issued `checkoutGroupId` —
 * order ownership/membership is resolved and re-validated entirely inside
 * `begin_xendit_group_payment_attempt`, and the amount is always the
 * server-computed sum from `getXenditGroupPaymentTotal`, never client-supplied.
 * Single-order behavior (`createXenditEwalletPaymentAction` above) is untouched.
 */
export async function createXenditGroupEwalletPaymentAction(
  checkoutGroupId: string,
  channelCode: "GCASH" | "PAYMAYA",
): Promise<ActionResult<null>> {
  const parsed = createXenditGroupEwalletPaymentSchema.safeParse({ checkoutGroupId, channelCode });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await queries.requireSessionUser();

  const existingAttempt = await queries.getFinalizedPendingXenditGroupPayment(
    parsed.data.checkoutGroupId,
    parsed.data.channelCode,
  );
  if (existingAttempt && isStaleXenditAttempt(existingAttempt)) {
    const reconciliation = await reconcileStaleXenditAttempt(
      parsed.data.checkoutGroupId,
      parsed.data.channelCode,
      existingAttempt,
    );
    if (reconciliation === "blocked") return fail(RECONCILIATION_RETRY_MESSAGE);
    if (reconciliation === "already_paid") {
      redirect(`${ROUTES.orders}?xendit_return=1`);
    }
    // "cleared_for_retry": fall through, beginXenditGroupPaymentAttempt will
    // correctly start a fresh combined attempt for the whole group.
  }

  // Checkout's "Change Payment Method": same cross-channel guard as the
  // single-order action above, scoped to the whole group.
  const otherAttempts = await queries.getOtherFinalizedPendingXenditGroupPayments(
    parsed.data.checkoutGroupId,
    parsed.data.channelCode,
  );
  if (await findBlockingOtherChannelAttempt(otherAttempts, () => parsed.data.checkoutGroupId)) return fail(CHANNEL_SWITCH_BLOCKED_MESSAGE);

  let redirectUrl: string;
  try {
    const attempt = await queries.beginXenditGroupPaymentAttempt(
      parsed.data.checkoutGroupId,
      parsed.data.channelCode,
    );

    if (attempt.xenditPaymentRequestId && attempt.checkoutUrl) {
      redirectUrl = attempt.checkoutUrl;
    } else {
      const { amountCents, currency } = await queries.getXenditGroupPaymentTotal(
        parsed.data.checkoutGroupId,
        parsed.data.channelCode,
      );
      // Lands back on Checkout's payment workspace (any one member order id
      // resolves the whole group there — see the resume route), never
      // Orders — the only place buyer payment initiation/retry is allowed
      // to happen. `buyer_order_lifecycle` reclassifies the group the
      // instant the webhook lands, so no tab/channel needs to ride in the
      // query string here.
      const returnUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${ROUTES.checkoutResume(attempt.orderId)}?xendit_return=1`;

      const response = await createEwalletPaymentRequest({
        referenceId: parsed.data.checkoutGroupId,
        channelCode: parsed.data.channelCode,
        amountCents,
        currency,
        successReturnUrl: returnUrl,
        failureReturnUrl: returnUrl,
        // See the single-order action above: `attempt.id` (a fresh payments
        // row per attempt) instead of the buyer's stable `user.id`, so
        // PAYMAYA's one-time-create customer reference_id is never reused
        // across separate group attempts.
        customer: { id: attempt.id, givenNames: user.fullName || user.email },
      });

      const action = response.actions?.find((a) => a.type === "REDIRECT_CUSTOMER");
      if (!action?.value) {
        await queries.finalizeXenditGroupPaymentRequest({
          checkoutGroupId: parsed.data.checkoutGroupId,
          channelCode: parsed.data.channelCode,
          xenditPaymentRequestId: response.payment_request_id,
          checkoutUrl: "",
          expiresAt: null,
          status: "failed",
        });
        return fail("Xendit did not return a checkout link. Please try again.");
      }

      const finalized = await queries.finalizeXenditGroupPaymentRequest({
        checkoutGroupId: parsed.data.checkoutGroupId,
        channelCode: parsed.data.channelCode,
        xenditPaymentRequestId: response.payment_request_id,
        checkoutUrl: action.value,
        expiresAt: null,
      });
      redirectUrl = finalized.checkoutUrl ?? action.value;
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not start this payment.");
  }

  redirect(redirectUrl);
}

/**
 * Combined-payment counterpart of `createXenditCardSessionAction` for a
 * multi-seller checkout. Same customer.reference_id-uniqueness fix as the
 * single-order Card action (a fresh member payment id, not the buyer's
 * stable user id). Single-order Card behavior is untouched.
 */
export async function createXenditGroupCardSessionAction(
  checkoutGroupId: string,
): Promise<ActionResult<{ checkoutGroupId: string; componentsSdkKey: string }>> {
  const parsed = createXenditGroupCardSessionSchema.safeParse({ checkoutGroupId });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await queries.requireSessionUser();

  const existingAttempt = await queries.getFinalizedPendingXenditGroupPayment(
    parsed.data.checkoutGroupId,
    "CARD",
  );
  if (existingAttempt) {
    if (isStaleXenditAttempt(existingAttempt)) {
      const reconciliation = await reconcileStaleXenditAttempt(
        parsed.data.checkoutGroupId,
        "CARD",
        existingAttempt,
      );
      if (reconciliation === "blocked") return fail(RECONCILIATION_RETRY_MESSAGE);
      if (reconciliation === "already_paid") {
        return fail("This order has already been paid. Refresh the page to see the updated status.");
      }
      // "cleared_for_retry": fall through to a genuinely fresh group attempt.
    } else {
      // Still fresh — same collision this guards against in the
      // single-order action above, just reached more easily here: before
      // the list-page UI fix (one shared action per group instead of one
      // per shop), a second order card's "Pay with Card" button would hit
      // this every time the first click had already succeeded. Kept as a
      // defense-in-depth guard even with that UI fix in place (e.g. two
      // separate order-detail tabs for different members of the same
      // group). Released only when Xendit confirms nothing was paid.
      const released = await releaseAbandonedCardAttempt(
        parsed.data.checkoutGroupId,
        existingAttempt,
      );
      if (released === "already_paid") {
        return fail("This order has already been paid. Refresh the page to see the updated status.");
      }
      if (released !== "cleared_for_retry") return fail(CARD_IN_PROGRESS_MESSAGE);
    }
  }

  // Checkout's "Change Payment Method": same cross-channel guard as the
  // group e-wallet action above.
  const otherAttempts = await queries.getOtherFinalizedPendingXenditGroupPayments(
    parsed.data.checkoutGroupId,
    "CARD",
  );
  if (await findBlockingOtherChannelAttempt(otherAttempts, () => parsed.data.checkoutGroupId)) return fail(CHANNEL_SWITCH_BLOCKED_MESSAGE);

  let attempt: Awaited<ReturnType<typeof queries.beginXenditGroupPaymentAttempt>> | undefined;
  try {
    attempt = await queries.beginXenditGroupPaymentAttempt(parsed.data.checkoutGroupId, "CARD");
    const { amountCents, currency } = await queries.getXenditGroupPaymentTotal(
      parsed.data.checkoutGroupId,
      "CARD",
    );
    // Lands back on Checkout's payment workspace, never Orders — same
    // reasoning as the group e-wallet action above.
    const returnUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}${ROUTES.checkoutResume(attempt.orderId)}?xendit_return=1`;

    const session = await createCardPaymentSession({
      referenceId: parsed.data.checkoutGroupId,
      amountCents,
      currency,
      successReturnUrl: returnUrl,
      cancelReturnUrl: returnUrl,
      customer: { id: attempt.id, givenNames: user.fullName || user.email },
    });

    await queries.finalizeXenditGroupPaymentRequest({
      checkoutGroupId: parsed.data.checkoutGroupId,
      channelCode: "CARD",
      xenditPaymentRequestId: session.payment_session_id,
      checkoutUrl: returnUrl,
      // Same real-expiry capture as the single-order Card action above.
      expiresAt: session.expires_at ?? null,
    });

    return ok({
      checkoutGroupId: parsed.data.checkoutGroupId,
      componentsSdkKey: session.components_sdk_key,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start this payment.";
    // See the single-order Card action above for why this only fires once
    // `attempt` exists.
    if (attempt) {
      await queries.logXenditCardSessionFailure(attempt.id, message);
    }
    return fail(message);
  }
}

/** What the buyer-facing "confirming your payment" watcher needs back. */
export type ConfirmedPaymentStatus = "pending" | "paid" | "failed";

/**
 * Real-time confirmation for a Xendit payment the buyer just made (or an
 * older one still showing "pending"). Asks Xendit itself for the attempt's
 * real status and applies it through the same `process_xendit_webhook` RPC
 * the webhook uses (see `reconcileReturnedXenditPayment`), so the order flips
 * to paid within seconds even when the webhook is late, misconfigured or
 * unreachable. Nothing is marked paid on the client's say-so: ownership is
 * enforced by RLS-scoped reads, the status comes from Xendit, and this only
 * ever reports the row's resulting state. Polled by `PaymentStatusWatcher`.
 */
export async function confirmXenditPaymentAction(
  input: unknown,
): Promise<ActionResult<{ status: ConfirmedPaymentStatus }>> {
  const parsed = confirmXenditPaymentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`confirmXenditPayment:${user.id}`, 60, 60);

    const { orderId, checkoutGroupId } = parsed.data;
    // Both lookups are RLS-scoped to the buyer's own orders, so another
    // buyer's id simply resolves to nothing.
    const read = async () =>
      checkoutGroupId
        ? queries.getActivePaymentForGroup(checkoutGroupId)
        : queries.getActivePaymentForOrder(orderId as string);

    let payment = await read();
    if (!payment || payment.paymentMethodType !== "xendit") return fail("Payment not found.");

    if (payment.status === "pending" && payment.xenditPaymentRequestId) {
      await reconcileReturnedXenditPayment(
        { id: payment.orderId, checkoutGroupId: payment.checkoutGroupId },
        payment.paymentChannel,
      ).catch(() => null);
      payment = (await read()) ?? payment;
    }

    const status: ConfirmedPaymentStatus =
      payment.status === "paid" ||
      payment.status === "refunded" ||
      payment.status === "partially_refunded"
        ? "paid"
        : payment.status === "failed"
          ? "failed"
          : "pending";
    if (status !== "pending") {
      revalidatePath(ROUTES.orders);
      revalidatePath(ROUTES.orderDetail(payment.orderId));
    }
    return ok({ status });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not confirm the payment.");
  }
}
