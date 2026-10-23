import type {
  CancellationRefundState,
  RefundPresentation,
} from "../types/cancellation.types.ts";

/**
 * Pure presentation rules for a cancellation refund (no framework imports so
 * `scripts/test-cancellation-refund.mjs` can run them directly).
 *
 * Timeframes come from Xendit's help centre ("How long does it take to process
 * a refund?"): e-wallet refunds reach the wallet in about 1 business day after
 * processing; card refunds depend on the cardholder's bank, usually 7-14
 * business days. Xendit has no visibility after a card refund is issued, so the
 * card wording is an estimate, never a promise.
 */
const EWALLET_TIMEFRAME = "usually within 1 business day";
const CARD_TIMEFRAME = "usually 7–14 business days, depending on your bank";

const CHANNEL_LABELS: Record<string, string> = {
  GCASH: "GCash",
  PAYMAYA: "Maya",
  CARD: "your card",
};

export function refundDestinationLabel(channel: string | null | undefined): string | null {
  if (!channel) return null;
  return CHANNEL_LABELS[channel] ?? null;
}

export function refundTimeframe(channel: string | null | undefined): string | null {
  if (channel === "GCASH" || channel === "PAYMAYA") return EWALLET_TIMEFRAME;
  if (channel === "CARD") return CARD_TIMEFRAME;
  return null;
}

export function describeCancellationRefund(
  state: CancellationRefundState,
  channel: string | null | undefined,
  formatAmount: (cents: number) => string,
): RefundPresentation {
  const amount = state.amountCents !== null ? formatAmount(state.amountCents) : null;
  const destination = refundDestinationLabel(channel);
  const timeframe = refundTimeframe(channel);
  const base = { destination, timeframe };

  if (state.kind === "none") {
    return {
      stage: "none",
      headline: "No payment to refund",
      detail: "You won't be charged for this order.",
      ...base,
    };
  }

  if (state.kind === "manual") {
    if (state.returnStatus === "refunded") {
      return {
        stage: "completed",
        headline: amount ? `Refund of ${amount} completed` : "Refund completed",
        detail: "The shop has paid your refund back to you.",
        ...base,
      };
    }
    return {
      stage: "manual_pending",
      headline: amount ? `Your ${amount} refund is being arranged` : "Your refund is being arranged",
      detail: "The shop will pay you back directly. You'll be notified once it is recorded.",
      ...base,
    };
  }

  if (state.refundStatus === "succeeded" || state.returnStatus === "refunded") {
    return {
      stage: "completed",
      headline: amount ? `Refund of ${amount} completed` : "Refund completed",
      detail: destination ? `Sent back to ${destination}.` : "Sent back to your original payment method.",
      ...base,
    };
  }

  if (state.refundStatus === "failed") {
    return {
      stage: "needs_attention",
      headline: "Your refund needs attention",
      detail:
        "We couldn't complete the refund automatically. The shop has been alerted and will retry it — your money is not lost.",
      ...base,
    };
  }

  return {
    stage: "processing",
    headline: amount ? `Your ${amount} refund is processing` : "Your refund is processing",
    detail: "No further action is needed.",
    ...base,
  };
}

/** The one-line confirmation shown right after a buyer cancels. */
export function cancellationConfirmationMessage(
  state: CancellationRefundState,
  formatAmount: (cents: number) => string,
): string {
  if (state.kind === "none" || state.amountCents === null) {
    return "Order cancelled. You won't be charged.";
  }
  const amount = formatAmount(state.amountCents);
  if (state.kind === "manual") {
    return `Order cancelled. The shop will pay your ${amount} back directly — you'll be notified once it's recorded.`;
  }
  return `Order cancelled. Your ${amount} refund is processing. No further action is needed.`;
}
