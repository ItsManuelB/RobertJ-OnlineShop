"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { recordCodRefundPayoutAction } from "@/features/returns/actions/return.actions";
import { COD_REFUND_METHOD_LABELS } from "@/features/returns/constants/return.constants";
import type { CodRefundMethod } from "@/features/returns/types/return.types";
import { formatCurrency } from "@/lib/utils/currency";

const inputClasses =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const METHODS = Object.keys(COD_REFUND_METHOD_LABELS) as CodRefundMethod[];

export interface RecordCodRefundPayoutPanelProps {
  returnId: string;
  amountCents: number | null;
  currency: string;
}

/**
 * Admin-only: records how a COD buyer was actually paid back, which is what
 * finalises the refund. Cash can't be returned through the app, so approving a
 * COD return only reserves the amount (`refund_due`); the payment, order and
 * reports change when this form is submitted. Only rendered by the caller while
 * `status === 'refund_due'`.
 */
export function RecordCodRefundPayoutPanel({
  returnId,
  amountCents,
  currency,
}: RecordCodRefundPayoutPanelProps) {
  const [method, setMethod] = useState<CodRefundMethod>("gcash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const methodId = useId();
  const referenceId = useId();
  const canSubmit = reference.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await recordCodRefundPayoutAction(returnId, method, reference.trim());
      if (!result.success) setError(result.error);
    });
  }

  return (
    <form
      aria-label="Record COD refund payout"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {error ? <ErrorState title="Couldn't record this payout" message={error} /> : null}

      <p className="text-xs font-semibold text-muted-foreground">
        {amountCents !== null ? `Send ${formatCurrency(amountCents, currency)} to the buyer, then` : "Send the refund to the buyer, then"}{" "}
        record how you paid. The order is only marked refunded once you submit this.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={methodId} className="text-xs font-semibold text-foreground">
          Paid via
        </label>
        <select
          id={methodId}
          value={method}
          onChange={(event) => setMethod(event.target.value as CodRefundMethod)}
          className={inputClasses}
        >
          {METHODS.map((value) => (
            <option key={value} value={value}>
              {COD_REFUND_METHOD_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={referenceId} className="text-xs font-semibold text-foreground">
          Reference number
        </label>
        <input
          id={referenceId}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          className={inputClasses}
          placeholder={method === "cash" ? "e.g. receipt or handover number" : "e.g. transaction or reference no."}
          maxLength={120}
          required
          autoComplete="off"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="rjSm" isLoading={isPending} disabled={!canSubmit}>
          Mark refund as paid
        </Button>
      </div>
    </form>
  );
}
