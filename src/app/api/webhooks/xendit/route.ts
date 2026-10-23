import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { xenditAmountToCents } from "@/lib/xendit/client";
import { refundLatePaymentOnCancelledOrder } from "@/lib/supabase/queries";
import { submitUnsubmittedRefunds } from "@/features/payments/lib/cancellation-refund";
import type { XenditPaymentWebhookPayload, XenditRefundWebhookPayload } from "@/lib/xendit/types";

/**
 * Xendit webhook receiver — the ONLY thing in this app allowed to mark a
 * payment/order `paid`. Never trust the frontend redirect for that; this
 * route is the sole authority, and even it defers the actual decision to
 * `process_xendit_webhook` (SECURITY DEFINER, service_role-only), which
 * re-validates the reference, amount, and currency against our own
 * database and is idempotent against retries/out-of-order delivery.
 *
 * Handles both the Payment Request webhook family (`payment.capture` /
 * `payment.authorization` / `payment.failure`, used by GCash/Maya) and,
 * defensively, a `payment_session.*` shape for Card — the exact event name
 * Xendit fires on Card session completion was not confirmed against a live
 * sandbox response during implementation (see DECISIONS.md).
 */
export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const expectedToken = env.XENDIT_WEBHOOK_TOKEN;
  const providedToken = request.headers.get("x-callback-token");

  if (!expectedToken || !isValidToken(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawPayload: { event?: unknown };
  try {
    rawPayload = (await request.json()) as { event?: unknown };
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  // Phase 5B: refund.* is a distinct event family from the payment.*/
  // payment_session.* shapes below — routed explicitly by `event` rather
  // than shape-guessing, since a refund payload also carries a `data.status`
  // field that could otherwise be mistaken for a payment webhook.
  if (typeof rawPayload.event === "string" && rawPayload.event.startsWith("refund.")) {
    return handleRefundWebhook(rawPayload as unknown as XenditRefundWebhookPayload);
  }

  const payload = rawPayload as unknown as XenditPaymentWebhookPayload;
  // Payment Session events (Card — `payment_session.completed`/`.expired`)
  // nest under `data` the same way the Payment Request family (GCash/Maya)
  // does; falls back to the payload's own top level only if `data` is
  // entirely absent (see XenditPaymentWebhookPayload's doc comment for why).
  const data = payload?.data ?? payload;
  // Card's underlying payment_request reference_id is Xendit-derived from the
  // payment_session's reference_id we set ({ours}_{xendit-suffix}) rather than
  // reused verbatim — the session can host more than one payment attempt, so
  // Xendit disambiguates them. Our own reference_id (and process_xendit_webhook's
  // p_reference_id) is a bare uuid, so take only the part before the first
  // underscore; uuids never contain one, so this is a no-op for GCash/Maya.
  const referenceId = data?.reference_id?.split("_")[0];
  const status = data?.status;

  const admin = createSupabaseAdminClient();

  if (!referenceId || !status) {
    // Not a shape we recognize. Persisted (unlike before, which only
    // `console.error`'d a summary) so a future occurrence leaves forensic
    // evidence instead of silently vanishing — this exact gap is why a real,
    // successfully-completed Card payment (payment_session
    // ps-6ab2814c3589faffa4215ef9) went unreconciled for hours before
    // self-healing via the nightly reconciliation sweep. See
    // docs/production-card-payment-stuck-audit.md.
    console.error("[xendit webhook] unrecognized payload shape", {
      event: payload?.event,
      hasDataKey: Boolean(payload?.data),
      dataKeys: data ? Object.keys(data) : null,
    });
    const { error: logError } = await admin.rpc("log_unrecognized_xendit_webhook_payload", {
      p_event_type: typeof payload?.event === "string" ? payload.event : "unknown",
      p_raw_payload: payload as unknown as Json,
    });
    if (logError) {
      console.error("[xendit webhook] failed to persist unrecognized payload", logError);
    }
    // Acknowledge so Xendit doesn't retry indefinitely.
    return NextResponse.json({ received: true, note: "unrecognized payload shape" });
  }

  // Payment Session's amount field is `amount`; the Payment Request family
  // (GCash/Maya) uses `request_amount` — see XenditPaymentWebhookPayload's
  // doc comment for how this was confirmed.
  const rawAmount =
    typeof data.request_amount === "number"
      ? data.request_amount
      : typeof data.amount === "number"
        ? data.amount
        : undefined;
  const amountCents = typeof rawAmount === "number" ? xenditAmountToCents(rawAmount) : 0;

  const { error } = await admin.rpc("process_xendit_webhook", {
    p_reference_id: referenceId,
    p_xendit_payment_request_id: data.payment_request_id ?? "",
    p_xendit_payment_id: data.payment_id ?? "",
    p_status: status,
    p_channel_code: data.channel_code ?? undefined,
    p_amount_cents: amountCents,
    p_currency: data.currency ?? "PHP",
    p_raw_payload: payload as unknown as Json,
  });

  if (error) {
    console.error("[xendit webhook] process_xendit_webhook failed", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  // A payment that succeeds AFTER its order was cancelled is ignored by
  // process_xendit_webhook ("order_cancelled"), which would keep the buyer's
  // money with nothing to show for it. Record it and refund it in full. Idempotent;
  // a failure returns 500 so Xendit redelivers.
  if (status === "SUCCEEDED") {
    try {
      const opened = await refundLatePaymentOnCancelledOrder({
        referenceId,
        xenditPaymentRequestId: data.payment_request_id ?? "",
        xenditPaymentId: data.payment_id ?? "",
        status,
        amountCents,
        currency: data.currency ?? "PHP",
        channelCode: data.channel_code ?? "",
        rawPayload: payload as unknown as Json,
      });
      if (opened > 0) await submitUnsubmittedRefunds();
    } catch (lateError) {
      console.error("[xendit webhook] late-payment refund failed", lateError);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}

/**
 * Phase 5B: `refund.succeeded`/`refund.failed` — the sole path (besides the
 * synchronous-but-never-trusted `POST /refunds` response) by which a
 * `xendit_refunds` attempt can resolve. Defers to
 * `process_xendit_refund_webhook` (service_role-only), which is idempotent
 * against duplicate/out-of-order delivery the same way `process_xendit_webhook`
 * is for payments.
 */
async function handleRefundWebhook(payload: XenditRefundWebhookPayload) {
  const data = payload?.data;
  const xenditRefundId = data?.id;
  const status = data?.status;

  if (!xenditRefundId || !status) {
    return NextResponse.json({ received: true, note: "unrecognized refund payload shape" });
  }

  const amountCents = typeof data.amount === "number" ? xenditAmountToCents(data.amount) : 0;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("process_xendit_refund_webhook", {
    p_xendit_refund_id: xenditRefundId,
    p_status: status,
    p_failure_code: data.failure_code ?? "",
    p_amount_cents: amountCents,
    p_raw_payload: payload as unknown as Json,
  });

  if (error) {
    console.error("[xendit webhook] process_xendit_refund_webhook failed", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function isValidToken(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
