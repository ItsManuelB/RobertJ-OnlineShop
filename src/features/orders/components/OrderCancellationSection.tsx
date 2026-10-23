import { CancellationRequestNotice } from "@/features/orders/components/CancellationRequestNotice";
import { CancellationRequestPanel } from "@/features/orders/components/CancellationRequestPanel";
import { RefundStatusCard } from "@/features/orders/components/RefundStatusCard";
import { RetryRefundButton } from "@/features/orders/components/RetryRefundButton";
import {
  getCancellationRefundForOrder,
  getCancellationRequestForOrder,
} from "@/lib/supabase/queries";
import { NO_CANCELLATION_REFUND } from "@/features/orders/types/cancellation.types";

/**
 * Everything about an order's cancellation that is not the status itself, for
 * the three order-detail pages:
 *  - buyer: the state of their cancellation request + the refund card;
 *  - seller / admin: the pending request to approve or decline (the decision
 *    goes through the same server action either way) + the refund card with a
 *    Retry button when the automatic refund failed.
 * Server component: it reads through the caller's own session, so RLS decides
 * what each viewer may see. Failures to load degrade to showing nothing rather
 * than breaking the order page.
 */
export async function OrderCancellationSection({
  orderId,
  viewer,
  paidOnline,
}: {
  orderId: string;
  viewer: "buyer" | "dashboard";
  paidOnline: boolean;
}) {
  const [request, refundInfo] = await Promise.all([
    getCancellationRequestForOrder(orderId).catch(() => null),
    getCancellationRefundForOrder(orderId).catch(() => ({
      refund: NO_CANCELLATION_REFUND,
      channel: null,
    })),
  ]);
  const { refund, channel } = refundInfo;

  if (!request && refund.kind === "none") return null;

  const showReview = viewer === "dashboard" && request?.status === "pending";
  const canRetry =
    viewer === "dashboard" &&
    refund.kind === "xendit" &&
    refund.refundStatus === "failed" &&
    refund.returnRequestId !== null;

  return (
    <div className="flex flex-col gap-3">
      {request ? (
        viewer === "buyer" ? (
          <CancellationRequestNotice request={request} />
        ) : showReview ? (
          <CancellationRequestPanel requestId={request.id} reason={request.reason} paidOnline={paidOnline} />
        ) : null
      ) : null}
      <RefundStatusCard
        refund={refund}
        channel={channel}
        audience={viewer === "buyer" ? "buyer" : "shop"}
        action={
          canRetry && refund.returnRequestId ? (
            <RetryRefundButton returnRequestId={refund.returnRequestId} orderId={orderId} />
          ) : null
        }
      />
    </div>
  );
}
