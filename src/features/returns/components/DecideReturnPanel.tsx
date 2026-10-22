"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { decideReturnAction } from "@/features/returns/actions/return.actions";
import {
  RETURN_REQUEST_TYPE,
  RETURN_REQUEST_TYPE_DESCRIPTIONS,
  RETURN_REQUEST_TYPE_LABELS,
} from "@/features/returns/constants/return.constants";
import type { AdminReturnDecision, ReturnRequestType } from "@/features/returns/types/return.types";

export interface DecideReturnPanelProps {
  returnId: string;
  /** Whether the seller already rejected this — informs the confirm copy, not the decision itself. */
  sellerRejected: boolean;
  /** The buyer's requested outcome — pre-selects the matching resolution when approving; admin can still choose differently. */
  requestedType: ReturnRequestType;
}

const RESOLUTION_OPTIONS = (Object.values(RETURN_REQUEST_TYPE) as ReturnRequestType[]).map((value) => ({
  value,
  label: RETURN_REQUEST_TYPE_LABELS[value],
  description: RETURN_REQUEST_TYPE_DESCRIPTIONS[value],
}));

/**
 * Admin-only: approves (refund or replacement) or rejects a return request
 * already responded to by its seller — or, fulfillment/returns audit
 * finding B1, a request still `pending` past `decide_return`'s own overdue
 * threshold, which the RPC now accepts directly. Approving surfaces a
 * resolution choice (money refund / return-and-refund / replacement) since
 * admin has the final say regardless of what the buyer originally asked
 * for — `decide_return`'s `p_resolution_type` only changes which branch
 * runs (refund math vs. the no-payment `replacement_approved` path), never
 * the authorization.
 */
export function DecideReturnPanel({ returnId, sellerRejected, requestedType }: DecideReturnPanelProps) {
  const [pendingDecision, setPendingDecision] = useState<AdminReturnDecision | null>(null);
  const [resolutionType, setResolutionType] = useState<ReturnRequestType>(requestedType);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmDecision() {
    if (!pendingDecision) return;
    setError(null);
    startTransition(async () => {
      const result = await decideReturnAction(
        returnId,
        pendingDecision,
        undefined,
        pendingDecision === "approve" ? resolutionType : undefined,
      );
      if (!result.success) {
        setError(result.error);
        setPendingDecision(null);
        return;
      }
      setPendingDecision(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorState title="Couldn't decide this return" message={error} /> : null}

      {pendingDecision === "approve" ? (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold text-foreground">Approve as…</legend>
            <ChoiceGroup
              label="Approve as"
              variant="tile"
              options={RESOLUTION_OPTIONS}
              value={resolutionType}
              onChange={setResolutionType}
              className="sm:grid sm:grid-cols-3 sm:gap-2"
            />
          </fieldset>
          <ConfirmPanel
            label={`Confirm: approve this return request as ${RETURN_REQUEST_TYPE_LABELS[resolutionType]}`}
            title="Approve this return request?"
            description={
              resolutionType === "replacement_exchange"
                ? "No payment is touched — you'll record the replacement shipment separately once it's ready."
                : "Cash-on-delivery orders are marked refunded immediately. Online (GCash/Maya/Card) payments submit a refund to the payment provider, which can take a few minutes to confirm. Either way, this can't be repeated once submitted."
            }
            tone="danger"
            confirmVariant="primary"
            confirmLabel="Yes, approve"
            isPending={isPending}
            onConfirm={confirmDecision}
            onCancel={() => setPendingDecision(null)}
          />
        </div>
      ) : pendingDecision === "reject" ? (
        <ConfirmPanel
          label="Confirm: reject this return request"
          title="Reject this return request?"
          description="The buyer will not be refunded. This is final."
          tone="danger"
          confirmVariant="danger"
          confirmLabel="Yes, reject"
          isPending={isPending}
          onConfirm={confirmDecision}
          onCancel={() => setPendingDecision(null)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="rjSm"
            onClick={() => {
              setResolutionType(requestedType);
              setPendingDecision("approve");
            }}
          >
            {sellerRejected ? "Overrule & approve" : "Approve"}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="rjSm"
            onClick={() => setPendingDecision("reject")}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
