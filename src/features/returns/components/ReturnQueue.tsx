import Link from "next/link";

import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { RETURN_STATUS } from "@/constants/status";
import { DecideReturnPanel } from "@/features/returns/components/DecideReturnPanel";
import { RecordReturnConditionPanel } from "@/features/returns/components/RecordReturnConditionPanel";
import { RecordReturnReplacementShipmentPanel } from "@/features/returns/components/RecordReturnReplacementShipmentPanel";
import { RespondToReturnPanel } from "@/features/returns/components/RespondToReturnPanel";
import { ReturnRequestStatusCard } from "@/features/returns/components/ReturnRequestStatusCard";
import { getReturnEvidenceSignedUrl, listReturnRequests } from "@/lib/supabase/queries";

export interface ReturnQueueProps {
  /**
   * Fulfillment/returns audit finding B1/P0-3: the seller's own dedicated
   * queue (mirroring this admin one) must NOT render `DecideReturnPanel` —
   * refund/replacement approval is admin-only (`decide_return` re-derives
   * `is_admin()`), so offering that button to a seller would just 403 on
   * click. The seller view instead offers `RespondToReturnPanel` (their
   * actual first-response step) directly from the list, so they don't have
   * to open each order individually to act.
   */
  viewer?: "admin" | "seller";
}

/**
 * Server Component: every return request visible to the caller (RLS scopes
 * to admin = all, seller = own-shop's), each with its evidence photo's
 * signed URL resolved up front since the bucket is private.
 */
export async function ReturnQueue({ viewer = "admin" }: ReturnQueueProps = {}) {
  let requests;
  try {
    requests = await listReturnRequests();
  } catch {
    return <ErrorState message="We couldn't load return requests right now." />;
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        title="No return or refund requests"
        description="Requests appear here as soon as a buyer files one — including ones still awaiting a response."
      />
    );
  }

  const withEvidence = await Promise.all(
    requests.map(async (request) => ({
      request,
      evidenceUrl: request.evidencePath
        ? await getReturnEvidenceSignedUrl(request.evidencePath).catch(() => null)
        : null,
    })),
  );

  const orderDetailHref = viewer === "seller" ? ROUTES.sellerOrderDetail : ROUTES.adminOrderDetail;

  return (
    <ul className="flex flex-col gap-3">
      {withEvidence.map(({ request, evidenceUrl }) => (
        <li key={request.id} className="flex flex-col gap-2">
          <Link
            href={orderDetailHref(request.orderId)}
            className="text-xs font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {request.orderNumber} →
          </Link>
          <ReturnRequestStatusCard request={request} evidenceUrl={evidenceUrl} themed />
          {request.status === RETURN_STATUS.pending ? (
            <RespondToReturnPanel returnId={request.id} />
          ) : null}
          {viewer === "admin" &&
          (request.status === RETURN_STATUS.sellerAccepted ||
            request.status === RETURN_STATUS.sellerRejected) ? (
            <DecideReturnPanel
              returnId={request.id}
              sellerRejected={request.status === RETURN_STATUS.sellerRejected}
              requestedType={request.requestType}
            />
          ) : null}
          {request.status === RETURN_STATUS.refunded &&
          !request.restockedAt &&
          !request.markedUnsellableAt ? (
            <RecordReturnConditionPanel returnId={request.id} />
          ) : null}
          {request.status === RETURN_STATUS.replacementApproved && !request.replacementShippedAt ? (
            <RecordReturnReplacementShipmentPanel returnId={request.id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
