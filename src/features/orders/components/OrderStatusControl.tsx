"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import type { OrderStatus } from "@/constants/status";
import { advanceOrderStatusAction } from "@/features/orders/actions/order.actions";
import { ItemVerificationChecklist } from "@/features/orders/components/ItemVerificationChecklist";
import { ShipmentCaptureForm } from "@/features/orders/components/ShipmentCaptureForm";
import { ORDER_STATUS_TRANSITIONS } from "@/features/orders/constants/order.constants";
import {
  OTHER_SELLER_CANCELLATION_REASON,
  SELLER_CANCELLATION_REASONS,
} from "@/features/orders/constants/seller-cancellation-reasons.constants";
import type { OrderItem } from "@/features/orders/types/order.types";
import { cn } from "@/lib/utils/cn";

/** Action-verb phrasing for the forward-advancement button (a noun-phrase status label reads awkwardly as a call-to-action). */
const ADVANCE_LABELS: Partial<Record<OrderStatus, string>> = {
  confirmed: "Confirm order",
  processing: "Verify items",
  shipped: "Mark as shipped",
  delivered: "Mark as delivered",
};

export interface OrderStatusControlProps {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  /** Order lines, used by the To Pack item-verification checklist. */
  items: OrderItem[];
  /** Themed (dashboard portal) vs. the buyer light surface — passed to the sub-panels. */
  themed?: boolean;
  /**
   * True when this is a Xendit order whose payment hasn't succeeded yet —
   * mirrors the server-side guard in `queries.advanceOrderStatus()`. Blocks
   * only the forward-advancement button so the seller sees why, instead of
   * clicking it and hitting the server error. Cancellation is unaffected.
   * Omitted/false for COD orders and already-paid Xendit orders.
   */
  paymentRequired?: boolean;
  /**
   * Set when the seller arrived here via a barcode scan of a Ready for
   * Pickup order's label — pre-opens the ship-confirmation form so they land
   * directly on "enter courier + tracking" instead of an extra click.
   * Courier/tracking are still required input; this only skips navigating
   * the panel open.
   */
  autoOpenShipment?: boolean;
  /**
   * Extra buttons/links rendered in the same row as the primary status
   * action (e.g. "Print shipping label") — keeps every top-level order
   * action grouped on one line instead of scattered across separate rows.
   * Hidden while a verification/shipment/cancel panel is open, same as the
   * primary row itself.
   */
  extraActions?: ReactNode;
}

/**
 * Seller/admin fulfilment control for the dashboard order detail page — the
 * single contextual status action (no parallel status control exists). Driven
 * by `ORDER_STATUS_TRANSITIONS`, it offers the next forward step and, for two
 * steps, the data/verification it needs before that step:
 *  - To Pack → Ready for Pickup: an item-verification checklist gate.
 *  - Ready for Pickup → Shipped: a courier/tracking capture form (saved
 *    atomically with the transition via `advanceOrderStatusAction`).
 * Cancellation (if still legal) goes through the same action — one write path.
 */
export function OrderStatusControl({
  orderId,
  orderNumber,
  status,
  items,
  themed = false,
  paymentRequired = false,
  autoOpenShipment = false,
  extraActions,
}: OrderStatusControlProps) {
  const allowed = ORDER_STATUS_TRANSITIONS[status];
  const nextStatus = allowed.find((candidate) => candidate !== "cancelled") ?? null;
  const canCancel = allowed.includes("cancelled");
  const blockedByPayment = paymentRequired && nextStatus !== null;

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [capturingShipment, setCapturingShipment] = useState(
    () => autoOpenShipment && nextStatus === "shipped" && !blockedByPayment,
  );
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const resolvedCancelReason =
    selectedReason === OTHER_SELLER_CANCELLATION_REASON
      ? otherText.trim()
      : (SELLER_CANCELLATION_REASONS.find((reason) => reason.value === selectedReason)?.label ?? "");

  function advance(
    target: OrderStatus,
    shipment?: { courier: string; trackingNumber: string },
    reason?: string,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await advanceOrderStatusAction(orderId, target, shipment, reason);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (target === "cancelled") {
        setConfirmingCancel(false);
        setSelectedReason(null);
        setOtherText("");
      }
      if (target === "processing") setVerifying(false);
      if (target === "shipped") setCapturingShipment(false);
    });
  }

  if (!nextStatus && !canCancel && !extraActions) return null;

  const panelOpen = confirmingCancel || verifying || capturingShipment;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <ErrorState title="Couldn't update the order" message={error} />
      ) : null}

      {blockedByPayment ? (
        <p className="text-xs text-muted-foreground">
          This order&apos;s online payment hasn&apos;t been completed yet. It can&apos;t be
          moved forward until the payment succeeds.
        </p>
      ) : null}

      {!panelOpen ? (
        <div className="flex flex-wrap gap-2">
          {nextStatus && !blockedByPayment ? (
            <Button
              type="button"
              variant="primary"
              size="rjSm"
              isLoading={isPending}
              onClick={() => {
                if (nextStatus === "processing") setVerifying(true);
                else if (nextStatus === "shipped") setCapturingShipment(true);
                else advance(nextStatus);
              }}
            >
              {ADVANCE_LABELS[nextStatus] ?? `Mark as ${nextStatus}`}
            </Button>
          ) : null}

          {canCancel ? (
            <button
              type="button"
              ref={triggerRef}
              className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
              onClick={() => setConfirmingCancel(true)}
            >
              {status === "shipped" ? "Report failed delivery" : "Cancel order"}
            </button>
          ) : null}

          {extraActions}
        </div>
      ) : null}

      {verifying ? (
        <ItemVerificationChecklist
          items={items}
          orderNumber={orderNumber}
          isPending={isPending}
          themed={themed}
          onConfirm={() => advance("processing")}
          onCancel={() => setVerifying(false)}
        />
      ) : null}

      {capturingShipment ? (
        <ShipmentCaptureForm
          isPending={isPending}
          themed={themed}
          onSubmit={(courier, trackingNumber) =>
            advance("shipped", { courier, trackingNumber })
          }
          onCancel={() => setCapturingShipment(false)}
        />
      ) : null}

      {confirmingCancel ? (
        <ConfirmPanel
          label={
            status === "shipped"
              ? `Report failed delivery for order ${orderNumber}`
              : `Cancel order ${orderNumber}`
          }
          title={
            status === "shipped"
              ? `Report failed delivery for order ${orderNumber}?`
              : `Cancel order ${orderNumber}?`
          }
          description={
            status === "shipped"
              ? "Use this when the delivery failed, was refused, or was returned to sender. This can't be undone. Stock is restocked automatically; payment status is unaffected."
              : "Please select a cancellation reason. This can't be undone. Stock is restocked automatically."
          }
          tone="danger"
          confirmLabel={status === "shipped" ? "Yes, report failed delivery" : "Yes, cancel order"}
          pendingLabel={status === "shipped" ? "Reporting…" : "Cancelling…"}
          cancelLabel="Keep order"
          isPending={isPending}
          triggerRef={triggerRef}
          onConfirm={() => advance("cancelled", undefined, resolvedCancelReason)}
          onCancel={() => {
            setConfirmingCancel(false);
            setSelectedReason(null);
            setOtherText("");
          }}
          confirmDisabled={!resolvedCancelReason}
        >
          <fieldset className="mt-3 flex flex-col gap-2">
            <legend className="text-xs font-semibold text-foreground">
              {status === "shipped" ? "What happened?" : "Select a cancellation reason"}
            </legend>
            {SELLER_CANCELLATION_REASONS.map((reason) => (
              <label
                key={reason.value}
                className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
              >
                <input
                  type="radio"
                  name="seller-cancel-reason"
                  value={reason.value}
                  checked={selectedReason === reason.value}
                  onChange={() => setSelectedReason(reason.value)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                {reason.label}
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="radio"
                name="seller-cancel-reason"
                value={OTHER_SELLER_CANCELLATION_REASON}
                checked={selectedReason === OTHER_SELLER_CANCELLATION_REASON}
                onChange={() => setSelectedReason(OTHER_SELLER_CANCELLATION_REASON)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
              Other
            </label>
            {selectedReason === OTHER_SELLER_CANCELLATION_REASON ? (
              <input
                type="text"
                value={otherText}
                onChange={(event) => setOtherText(event.target.value)}
                placeholder="Please specify…"
                maxLength={500}
                autoFocus
                className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            ) : null}
          </fieldset>
        </ConfirmPanel>
      ) : null}
    </div>
  );
}
