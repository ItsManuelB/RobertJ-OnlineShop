import { Badge } from "@/components/ui/badge";
import { RJ_CARD } from "@/components/ui/card";
import type { CancellationRefundState, RefundStage } from "@/features/orders/types/cancellation.types";
import { describeCancellationRefund } from "@/features/orders/utils/cancellation-refund";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

const STAGE_TONE: Record<RefundStage, "neutral" | "info" | "success" | "danger" | "warning"> = {
  none: "neutral",
  processing: "info",
  completed: "success",
  needs_attention: "danger",
  manual_pending: "warning",
};

const STAGE_LABEL: Record<RefundStage, string> = {
  none: "No refund",
  processing: "Processing",
  completed: "Completed",
  needs_attention: "Needs attention",
  manual_pending: "Being arranged",
};

/**
 * Amount, destination, status and a provider-based timeframe for the refund
 * that a cancellation opened. Status wording comes from the pure
 * `describeCancellationRefund`; "Completed" only appears once Xendit (or staff,
 * for COD) has confirmed it. `audience` switches the failure copy: the buyer is
 * told it is being handled, the shop is told to act. `action` is the retry slot.
 */
export function RefundStatusCard({
  refund,
  channel,
  audience = "buyer",
  action,
}: {
  refund: CancellationRefundState;
  channel: string | null;
  audience?: "buyer" | "shop";
  action?: React.ReactNode;
}) {
  if (refund.kind === "none") return null;
  const view = describeCancellationRefund(refund, channel, formatCurrency);
  const shopFailure =
    audience === "shop" && view.stage === "needs_attention"
      ? "Xendit could not complete this refund. Retry it below; the buyer can see it is being handled."
      : null;

  return (
    <section aria-label="Refund status" className={cn(RJ_CARD, "flex flex-col gap-2 p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-rj-black">Refund</h2>
        <Badge tone={STAGE_TONE[view.stage]}>{STAGE_LABEL[view.stage]}</Badge>
      </div>
      <p className="text-sm font-medium text-rj-black">{view.headline}</p>
      <p className="text-xs text-rj-gray-600">{shopFailure ?? view.detail}</p>
      {view.stage === "processing" || view.stage === "completed" ? (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {view.destination ? (
            <>
              <dt className="text-rj-gray-500">Refunded to</dt>
              <dd className="text-rj-black">{view.destination}</dd>
            </>
          ) : null}
          {view.stage === "processing" && view.timeframe ? (
            <>
              <dt className="text-rj-gray-500">Expected</dt>
              <dd className="text-rj-black">{view.timeframe}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {action}
    </section>
  );
}
