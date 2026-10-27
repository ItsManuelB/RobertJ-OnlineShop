import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { RETURN_STATUS } from "@/constants/status";
import { DecideReturnPanel } from "@/features/returns/components/DecideReturnPanel";
import { RecordCodRefundPayoutPanel } from "@/features/returns/components/RecordCodRefundPayoutPanel";
import { RecordReturnConditionPanel } from "@/features/returns/components/RecordReturnConditionPanel";
import { RecordReturnReplacementShipmentPanel } from "@/features/returns/components/RecordReturnReplacementShipmentPanel";
import { RespondToReturnPanel } from "@/features/returns/components/RespondToReturnPanel";
import { ReturnProgress } from "@/features/returns/components/ReturnProgress";
import { ReturnShippingActions } from "@/features/returns/components/ReturnShippingActions";
import { ReturnRequestStatusCard } from "@/features/returns/components/ReturnRequestStatusCard";
import { ReturnQueueTabs } from "@/features/returns/components/ReturnQueueTabs";
import {
  DEFAULT_SELLER_RETURN_TAB,
  SELLER_RETURN_TABS,
  isSellerReturnTab,
  matchesSellerReturnTab,
  type SellerReturnTab,
} from "@/features/returns/utils/seller-return-queue";
import { getResponseDeadline } from "@/features/returns/utils/return-progress";
import { daysSince } from "@/lib/utils/date";
import { PaginationControls } from "@/features/products/components/PaginationControls";
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
  /** Seller view only: the `?tab=` / `?page=` URL params (raw — validated here). The admin queue is unchanged and ignores them. */
  tab?: string;
  page?: string;
}

/** Seller queue page size — evidence photos are signed per rendered request, so keep a page small. */
const SELLER_QUEUE_PAGE_SIZE = 10;

/**
 * Server Component: every return request visible to the caller (RLS scopes
 * to admin = all, seller = own-shop's), each with its evidence photo's
 * signed URL resolved up front since the bucket is private.
 */
export async function ReturnQueue({ viewer = "admin", tab, page }: ReturnQueueProps = {}) {
  let allRequests;
  try {
    allRequests = await listReturnRequests();
  } catch {
    return <ErrorState message="We couldn't load return requests right now." />;
  }

  if (allRequests.length === 0) {
    return (
      <EmptyState
        title="No return or refund requests"
        description="Requests appear here as soon as a buyer files one — including ones still awaiting a response."
      />
    );
  }

  // Seller view: tabs + pagination over the already-RLS-scoped list. Admin
  // keeps the full list exactly as before.
  let requests = allRequests;
  let sellerTabs: { active: SellerReturnTab; counts: Record<SellerReturnTab, number> } | null = null;
  let totalPages = 1;
  let currentPage = 1;
  if (viewer === "seller") {
    const active = isSellerReturnTab(tab) ? tab : DEFAULT_SELLER_RETURN_TAB;
    const counts = Object.fromEntries(
      SELLER_RETURN_TABS.map((value) => [
        value,
        allRequests.filter((request) => matchesSellerReturnTab(request, value)).length,
      ]),
    ) as Record<SellerReturnTab, number>;
    sellerTabs = { active, counts };

    const filtered = allRequests.filter((request) => matchesSellerReturnTab(request, active));
    totalPages = Math.max(1, Math.ceil(filtered.length / SELLER_QUEUE_PAGE_SIZE));
    const requested = Number.parseInt(page ?? "1", 10);
    currentPage = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), totalPages) : 1;
    requests = filtered.slice(
      (currentPage - 1) * SELLER_QUEUE_PAGE_SIZE,
      currentPage * SELLER_QUEUE_PAGE_SIZE,
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

  // Seller view: how many requests are still waiting on the seller's first response.
  const awaitingResponse =
    viewer === "seller" ? allRequests.filter((request) => request.status === RETURN_STATUS.pending) : [];
  const urgentCount = awaitingResponse.filter(
    (request) => getResponseDeadline(daysSince(request.createdAt)).urgent,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {awaitingResponse.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1 text-sm text-foreground">
            <span className="font-semibold">
              {awaitingResponse.length} request{awaitingResponse.length === 1 ? " needs" : "s need"} your response
              {urgentCount > 0 ? `, ${urgentCount} due tomorrow or sooner` : ""}.
            </span>{" "}
            Buyers are waiting for your reply.
          </p>
          {sellerTabs && sellerTabs.active !== "action" ? (
            <Link href={`${ROUTES.sellerReturns}?tab=action`} className={buttonVariants({ variant: "outline", size: "rjSm" })}>
              Show them
            </Link>
          ) : null}
        </div>
      ) : null}
      {sellerTabs ? <ReturnQueueTabs active={sellerTabs.active} counts={sellerTabs.counts} /> : null}
      {requests.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="No return requests in this tab. Switch tabs to see the rest."
        />
      ) : null}
      <ul className="flex flex-col gap-3">
        {withEvidence.map(({ request, evidenceUrl }) => (
          <li
            key={request.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={orderDetailHref(request.orderId)}
                  className="text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {request.orderNumber} →
                </Link>
                <p className="text-xs text-muted-foreground">
                  {request.buyerName ? `${request.buyerName} · ` : ""}
                  {requestAge(request.createdAt)}
                </p>
              </div>
              {request.status === RETURN_STATUS.pending ? (
                <ResponseDeadlineBadge elapsedDays={daysSince(request.createdAt)} />
              ) : null}
            </div>
            <ReturnRequestStatusCard request={request} evidenceUrl={evidenceUrl} themed embedded />
            <ReturnProgress request={request} />
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
            <ReturnShippingActions request={request} viewer={viewer} />
            {viewer === "admin" && request.status === RETURN_STATUS.refundDue ? (
              <RecordCodRefundPayoutPanel
                returnId={request.id}
                amountCents={request.refundAmountCents}
                currency={request.currency}
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
      {sellerTabs && totalPages > 1 ? (
        <PaginationControls page={currentPage} totalPages={totalPages} themed />
      ) : null}
    </div>
  );
}

function requestAge(createdAt: string): string {
  const days = daysSince(createdAt);
  if (days === 0) return "Requested today";
  return `Requested ${days} day${days === 1 ? "" : "s"} ago`;
}

function ResponseDeadlineBadge({ elapsedDays }: { elapsedDays: number }) {
  const deadline = getResponseDeadline(elapsedDays);
  return <Badge tone={deadline.urgent ? "danger" : "neutral"}>{deadline.label}</Badge>;
}
