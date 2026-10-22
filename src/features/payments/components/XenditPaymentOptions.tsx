"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  createXenditEwalletPaymentAction,
  createXenditGroupEwalletPaymentAction,
} from "@/features/payments/actions/xendit.actions";
import { XenditCardPaymentButton } from "@/features/payments/components/XenditCardPaymentButton";

type XenditPaymentOptionsProps = (
  | { orderId: string; checkoutGroupId?: undefined }
  | { orderId?: undefined; checkoutGroupId: string }
) & {
  /** A still-valid, previously-started attempt's checkout URL, if any — resuming avoids creating a duplicate. */
  existingCheckoutUrl: string | null;
  /**
   * When true, an existing in-progress attempt is shown alongside the
   * channel options instead of hiding them, so the buyer can resume it or
   * start a different channel — each channel is independently idempotent
   * (`begin_xendit_group_payment_attempt`'s reuse check is scoped per
   * `payment_channel`), so offering a fresh choice alongside the resume
   * link never risks a duplicate charge. Defaults to false, preserving the
   * order-detail page's existing exclusive-resume behavior unchanged; only
   * the multi-seller confirmation page opts in.
   */
  allowSwitchingWhileActive?: boolean;
};

/**
 * Buyer-facing "Pay Online" entry point — GCash/Maya redirect straight to
 * Xendit's hosted checkout; Card uses an embedded Xendit Components widget.
 * None of these mark the order paid themselves — only the Xendit webhook
 * does that (see `process_xendit_webhook`).
 *
 * Pass `orderId` for a single pending order, or `checkoutGroupId` to start
 * one combined payment for an entire multi-seller checkout group — every
 * sibling order is confirmed together by the same webhook call.
 */
export function XenditPaymentOptions(props: XenditPaymentOptionsProps) {
  const { existingCheckoutUrl, allowSwitchingWhileActive = false } = props;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function payWithEwallet(channelCode: "GCASH" | "PAYMAYA") {
    setError(null);
    startTransition(async () => {
      const result =
        props.orderId !== undefined
          ? await createXenditEwalletPaymentAction(props.orderId, channelCode)
          : await createXenditGroupEwalletPaymentAction(props.checkoutGroupId, channelCode);
      if (!result.success) setError(result.error);
    });
  }

  const resumeBanner = existingCheckoutUrl ? (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-rj-gray-600">You have a payment in progress.</p>
      <a
        href={existingCheckoutUrl}
        className="inline-flex w-fit items-center rounded-full bg-rj-red px-6 py-2.5 text-sm font-bold text-rj-white transition-colors hover:bg-rj-red-dark"
      >
        Continue to payment
      </a>
    </div>
  ) : null;

  if (existingCheckoutUrl && !allowSwitchingWhileActive) {
    return resumeBanner;
  }

  return (
    <div className="flex flex-col gap-4">
      {resumeBanner}
      {resumeBanner ? (
        <p className="text-xs text-rj-gray-600">Or choose a different payment method:</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="rj"
          size="rj"
          isLoading={isPending}
          onClick={() => payWithEwallet("GCASH")}
        >
          Pay with GCash
        </Button>
        <Button
          type="button"
          variant="rj"
          size="rj"
          isLoading={isPending}
          onClick={() => payWithEwallet("PAYMAYA")}
        >
          Pay with Maya
        </Button>
      </div>
      {props.orderId !== undefined ? (
        <XenditCardPaymentButton orderId={props.orderId} />
      ) : (
        <XenditCardPaymentButton checkoutGroupId={props.checkoutGroupId} />
      )}
      {error ? <ErrorState title="Couldn't start payment" message={error} /> : null}
    </div>
  );
}
