"use client";

import { useState } from "react";

import { RJ_CARD } from "@/components/ui/card";
import { ConfirmReceivedButton } from "@/features/orders/components/ConfirmReceivedButton";
import { ReportProblemPanel } from "@/features/returns/components/ReportProblemPanel";
import { cn } from "@/lib/utils/cn";

export interface DeliveryResolutionChoiceProps {
  orderId: string;
  orderNumber: string;
  /**
   * Fulfillment/returns audit finding A1: true when the order is still
   * `shipped` rather than `delivered` — the buyer's own "I received it"
   * click IS the delivery event in this case (see `confirm_order_received`),
   * and a report can only be filed as `item_not_received` until the order
   * actually arrives. Copy and the reason dropdown both adapt accordingly.
   */
  awaitingDelivery?: boolean;
}

/**
 * Shown once no return request is open and the buyer hasn't yet confirmed
 * receipt — the two mutually exclusive choices ("everything's fine" vs.
 * "something's wrong"), matching the approved design. Report a Problem
 * starts collapsed behind its own button so the two paths read as parallel
 * choices, not one primary and one buried action. Also shown on a `shipped`
 * order (not just `delivered`) since the buyer's own confirmation now
 * supplies the missing delivery signal when a seller never advances it.
 */
export function DeliveryResolutionChoice({
  orderId,
  orderNumber,
  awaitingDelivery = false,
}: DeliveryResolutionChoiceProps) {
  const [reporting, setReporting] = useState(false);

  if (reporting) {
    return (
      <ReportProblemPanel
        orderId={orderId}
        onCancel={() => setReporting(false)}
        onlyItemNotReceived={awaitingDelivery}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className={cn(RJ_CARD, "flex flex-col gap-2 p-5")}>
        <p className="text-sm font-bold text-rj-black">
          {awaitingDelivery ? "Already got your order?" : "Everything arrived as expected?"}
        </p>
        <p className="text-xs text-rj-gray-600">
          Confirming closes out this order — you can still leave a review afterward.
        </p>
        <div className="mt-1">
          <ConfirmReceivedButton orderId={orderId} orderNumber={orderNumber} />
        </div>
      </div>
      <div className={cn(RJ_CARD, "flex flex-col gap-2 p-5")}>
        <p className="text-sm font-bold text-rj-black">
          {awaitingDelivery ? "Hasn't arrived yet?" : "Something wrong with this order?"}
        </p>
        <p className="text-xs text-rj-gray-600">
          {awaitingDelivery
            ? "If it's been a few days since this shipped with no sign of it, let us know."
            : "Non-delivery, wrong or damaged item, missing item, or anything else — tell us what happened."}
        </p>
        <button
          type="button"
          className="mt-1 w-fit rounded-full border-[1.5px] border-rj-black px-6 py-2 text-[12px] font-bold text-rj-black transition-colors hover:bg-rj-black hover:text-rj-white"
          onClick={() => setReporting(true)}
        >
          Report a Problem
        </button>
      </div>
    </div>
  );
}
