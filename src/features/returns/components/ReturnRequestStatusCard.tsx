import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import { RETURN_STATUS, RETURN_STATUS_LABELS, type ReturnStatus } from "@/constants/status";
import {
  COD_REFUND_METHOD_LABELS,
  RETURN_REQUEST_TYPE_LABELS,
} from "@/features/returns/constants/return.constants";
import type { ReturnRequest } from "@/features/returns/types/return.types";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { getPendingXenditRefundForReturn } from "@/lib/supabase/queries";

const RETURN_STATUS_TONE: Record<ReturnStatus, "neutral" | "info" | "success" | "danger" | "warning"> = {
  pending: "neutral",
  seller_accepted: "info",
  seller_rejected: "danger",
  admin_rejected: "danger",
  refunded: "success",
  replacement_approved: "warning",
  refund_due: "warning",
};

export interface ReturnRequestStatusCardProps {
  request: ReturnRequest;
  /** Pre-resolved signed URL (bucket is private) for `request.evidencePath`, or null if none/failed to load. */
  evidenceUrl: string | null;
  /** Renders through the Admin/Seller portal's tokens instead of the fixed rj-* palette. See OrderHeader. */
  themed?: boolean;
}

/**
 * Display-only summary of one return request — reused on the buyer's order
 * page, the seller's dashboard order page (alongside `RespondToReturnPanel`),
 * and the admin queue. No actions live here; each surface composes its own
 * action panel next to this card.
 *
 * Phase 5B: async Server Component so every caller gets the "refund
 * submitted, awaiting confirmation" state for free, with no prop threading.
 * `status` deliberately stays `seller_accepted`/`seller_rejected` while a
 * Xendit refund is in flight (see the migration) — this component is what
 * makes that pending state explicit instead of the card looking like
 * nothing happened after an admin approves.
 */
export async function ReturnRequestStatusCard({
  request,
  evidenceUrl,
  themed = false,
}: ReturnRequestStatusCardProps) {
  const pendingRefund =
    request.status === "seller_accepted" || request.status === "seller_rejected"
      ? await getPendingXenditRefundForReturn(request.id).catch(() => null)
      : null;

  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";
  const border = themed ? "border-border" : "border-rj-gray-100";
  const ring = themed ? "focus-visible:ring-ring/30" : "focus-visible:ring-rj-red/30";

  return (
    <section aria-label="Return/refund request" className={cn(themed ? THEMED_CARD : RJ_CARD, "p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cn("text-[10px] font-bold uppercase tracking-[0.3em]", muted)}>
          {request.orderItemTitle ? `Return: ${request.orderItemTitle}` : "Return request"}
        </h2>
        <Badge tone={RETURN_STATUS_TONE[request.status]}>
          {RETURN_STATUS_LABELS[request.status]}
        </Badge>
      </div>

      <p className={cn("mt-2 text-xs", muted)}>
        Requested {formatDateTime(request.createdAt)}
        {request.buyerName ? ` by ${request.buyerName}` : ""} —{" "}
        {RETURN_REQUEST_TYPE_LABELS[request.requestType]}
      </p>
      <p className={cn("mt-2 text-sm", ink)}>{request.reason}</p>

      {themed &&
      request.orderPaymentMethod === "cod" &&
      request.orderPaymentStatus !== "paid" &&
      (request.status === RETURN_STATUS.pending ||
        request.status === RETURN_STATUS.sellerAccepted ||
        request.status === RETURN_STATUS.sellerRejected) ? (
        <p className={cn("mt-3 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs", muted)}>
          <span className="font-semibold text-warning">Refund approval will fail right now:</span> this
          order&apos;s COD cash hasn&apos;t been recorded as collected yet. Mark it collected on the order
          first.
        </p>
      ) : null}

      {evidenceUrl ? (
        <a
          href={evidenceUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "relative mt-3 block h-32 w-32 overflow-hidden rounded-xl border focus-visible:outline-none focus-visible:ring-2",
            border,
            ring,
          )}
        >
          {/* unoptimized: a short-lived signed Storage URL, not a stable path next/image should cache/optimize. */}
          <Image src={evidenceUrl} alt="Return evidence" fill unoptimized className="object-cover" />
        </a>
      ) : null}

      {request.sellerDecisionNote ? (
        <p className={cn("mt-3 border-t pt-3 text-xs", border, muted)}>
          <span className={cn("font-semibold", ink)}>Seller response:</span>{" "}
          {request.sellerDecisionNote}
        </p>
      ) : null}

      {request.adminDecisionNote ? (
        <p className={cn("mt-2 text-xs", muted)}>
          <span className={cn("font-semibold", ink)}>Admin decision:</span>{" "}
          {request.adminDecisionNote}
        </p>
      ) : null}

      {pendingRefund ? (
        <div className={cn("mt-3 border-t pt-3", border)}>
          <Badge tone="warning">Refund submitted — awaiting confirmation</Badge>
          <p className={cn("mt-1 text-xs", muted)}>
            {formatCurrency(pendingRefund.amountCents, pendingRefund.currency)} was submitted to
            the payment provider. This can take a few minutes to confirm.
          </p>
        </div>
      ) : null}

      {request.status === RETURN_STATUS.refundDue && request.refundAmountCents !== null ? (
        <p className={cn("mt-3 text-sm font-semibold", ink)}>
          Refund of {formatCurrency(request.refundAmountCents, request.currency)} approved
          <span className={cn("ml-1 text-xs font-normal", muted)}>
            — the payout to the buyer is still being sent.
          </span>
        </p>
      ) : null}

      {request.status === RETURN_STATUS.refunded && request.refundAmountCents !== null ? (
        <p className={cn("mt-3 text-sm font-semibold", themed ? "text-success" : "text-rj-green")}>
          Refunded {formatCurrency(request.refundAmountCents, request.currency)}
        </p>
      ) : null}

      {request.codRefundMethod && request.codRefundedAt ? (
        <p className={cn("mt-1 text-xs", muted)}>
          Paid out via {COD_REFUND_METHOD_LABELS[request.codRefundMethod]}
          {request.codRefundReference ? ` — ref ${request.codRefundReference}` : ""} (
          {formatDateTime(request.codRefundedAt)})
        </p>
      ) : null}

      {request.restockedAt ? (
        <p className={cn("mt-2 text-xs", muted)}>
          <span className={cn("font-semibold", ink)}>Item condition:</span> confirmed sellable — stock restored.
        </p>
      ) : request.markedUnsellableAt ? (
        <p className={cn("mt-2 text-xs", muted)}>
          <span className={cn("font-semibold", ink)}>Item condition:</span> not sellable — stock not restored.
        </p>
      ) : null}

      {request.status === RETURN_STATUS.replacementApproved ? (
        <p className={cn("mt-3 text-xs", muted)}>
          <span className={cn("font-semibold", ink)}>Replacement:</span>{" "}
          {request.replacementShippedAt
            ? `shipped via ${request.replacementCourier} — tracking ${request.replacementTrackingNumber} (${formatDateTime(request.replacementShippedAt)})`
            : "approved — awaiting shipment"}
        </p>
      ) : null}
    </section>
  );
}
