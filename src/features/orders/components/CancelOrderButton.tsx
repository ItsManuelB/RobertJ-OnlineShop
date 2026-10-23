"use client";

import { useRef, useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  cancelOrderAction,
  requestOrderCancellationAction,
} from "@/features/orders/actions/order.actions";
import {
  CANCELLATION_REASONS,
  OTHER_CANCELLATION_REASON,
} from "@/features/orders/constants/cancellation-reasons.constants";
import { cn } from "@/lib/utils/cn";

/**
 * Cancel trigger + inline confirm. Two modes, one reason picker:
 *  - `cancel` (pending/confirmed): cancels immediately; a paid order is refunded
 *    automatically, so `refundHint` tells the buyer that up front.
 *  - `request` (processing — the seller already started preparing it): asks the
 *    seller to approve; nothing changes until they respond.
 * The confirm panel requires a reason (or typed text under "Other") before the
 * button enables — persisted as `orders.cancellation_reason` /
 * `cancellation_requests.reason`. The action revalidates, and the success
 * message stays on screen so the buyer sees exactly what happens next.
 */
export function CancelOrderButton({
  orderId,
  orderNumber,
  mode = "cancel",
  refundHint = null,
}: {
  orderId: string;
  orderNumber: string;
  mode?: "cancel" | "request";
  refundHint?: string | null;
}) {
  const isRequest = mode === "request";
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const resolvedReason =
    selectedReason === OTHER_CANCELLATION_REASON
      ? otherText.trim()
      : (CANCELLATION_REASONS.find((reason) => reason.value === selectedReason)?.label ?? "");

  function handleConfirm() {
    if (!resolvedReason || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = isRequest
        ? await requestOrderCancellationAction(orderId, resolvedReason)
        : await cancelOrderAction(orderId, resolvedReason);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDoneMessage(result.data.message);
      setConfirmOpen(false);
    });
  }

  function reset() {
    setConfirmOpen(false);
    setSelectedReason(null);
    setOtherText("");
    setError(null);
  }

  if (doneMessage) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
      >
        {doneMessage}
      </p>
    );
  }

  const description = isRequest
    ? "The shop has already started preparing this order, so they need to approve the cancellation. Please select a reason. If they decline, your order stays active."
    : "Please select a cancellation reason. Take note that this will cancel the whole order and the action cannot be undone.";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          ref={triggerRef}
          className={cn(buttonVariants({ variant: "rjOutline", size: "rjSm" }))}
          onClick={() => setConfirmOpen(true)}
        >
          {isRequest ? "Request cancellation" : "Cancel order"}
        </button>
      </div>

      {confirmOpen ? (
        <>
          <ConfirmPanel
            label={`${isRequest ? "Request cancellation of" : "Cancel"} order ${orderNumber}`}
            title={isRequest ? `Request cancellation of order ${orderNumber}?` : `Cancel order ${orderNumber}?`}
            description={description}
            tone="danger"
            confirmLabel={isRequest ? "Send request" : "Yes, cancel order"}
            pendingLabel={isRequest ? "Sending…" : "Cancelling…"}
            cancelLabel="Not now"
            isPending={isPending}
            triggerRef={triggerRef}
            onConfirm={handleConfirm}
            onCancel={reset}
            confirmDisabled={!resolvedReason}
          >
            {refundHint ? (
              <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs text-foreground">
                {refundHint}
              </p>
            ) : null}
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="text-xs font-semibold text-foreground">
                Select a cancellation reason
              </legend>
              {CANCELLATION_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    onChange={() => setSelectedReason(reason.value)}
                    className="h-4 w-4 shrink-0 accent-rj-red"
                  />
                  {reason.label}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="radio"
                  name="cancel-reason"
                  value={OTHER_CANCELLATION_REASON}
                  checked={selectedReason === OTHER_CANCELLATION_REASON}
                  onChange={() => setSelectedReason(OTHER_CANCELLATION_REASON)}
                  className="h-4 w-4 shrink-0 accent-rj-red"
                />
                Other
              </label>
              {selectedReason === OTHER_CANCELLATION_REASON ? (
                <input
                  type="text"
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                  placeholder="Please specify…"
                  maxLength={500}
                  autoFocus
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
                />
              ) : null}
            </fieldset>
          </ConfirmPanel>
          {error ? (
            <ErrorState
              title={isRequest ? "Couldn't send the request" : "Couldn't cancel the order"}
              message={error}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
