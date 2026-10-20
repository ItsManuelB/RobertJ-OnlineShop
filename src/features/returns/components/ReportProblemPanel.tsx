"use client";

import { useActionState, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ErrorState } from "@/components/feedback/ErrorState";
import { requestReturnAction } from "@/features/returns/actions/return.actions";
import {
  RETURN_EXPLANATION_MAX_LENGTH,
  RETURN_REASON_CODE_LABELS,
  RETURN_REASON_CODE_OPTIONS,
  RETURN_REQUEST_TYPE,
  RETURN_REQUEST_TYPE_DESCRIPTIONS,
  RETURN_REQUEST_TYPE_LABELS,
  SHIPPED_ELIGIBLE_REASON_CODE,
} from "@/features/returns/constants/return.constants";
import type { ReturnReasonCode, ReturnRequestType } from "@/features/returns/types/return.types";
import { cn } from "@/lib/utils/cn";
import type { ActionResult } from "@/types/action.types";

export interface ReportProblemPanelProps {
  orderId: string;
  /** Shown when this panel is presented as one of two side-by-side choices (paired with `ConfirmReceivedButton`) rather than the only option on the page. */
  onCancel?: () => void;
  /**
   * Fulfillment/returns audit finding A3: true for an order still
   * `shipped` (not yet `delivered`) — `request_return` only accepts that
   * status for `item_not_received`, so every other reason would just fail
   * server-side. Narrows the dropdown to the one reason that actually
   * applies instead of offering choices that can't be submitted yet.
   */
  onlyItemNotReceived?: boolean;
}

const REQUEST_TYPE_OPTIONS = (
  Object.values(RETURN_REQUEST_TYPE) as ReturnRequestType[]
).map((value) => ({
  value,
  label: RETURN_REQUEST_TYPE_LABELS[value],
  description: RETURN_REQUEST_TYPE_DESCRIPTIONS[value],
}));

/**
 * Buyer's "something's wrong" path — the counterpart to
 * `ConfirmReceivedButton`'s "everything arrived as expected" path. A radio
 * group for the requested resolution, a single-select dropdown for the
 * reason, and (only for "Other") a required, length-counted explanation —
 * submits through `requestReturnAction`/`request_return`, which re-derives
 * every one of these checks server-side rather than trusting this form.
 * Filing this creates a `return_requests` row your seller (then an admin,
 * if escalated) must resolve — the order is not treated as done in the
 * meantime.
 */
export function ReportProblemPanel({ orderId, onCancel, onlyItemNotReceived = false }: ReportProblemPanelProps) {
  const [state, formAction, isPending] = useActionState<
    ActionResult<null> | null,
    FormData
  >(requestReturnAction, null);

  const reasonOptions = useMemo(
    () =>
      onlyItemNotReceived
        ? [SHIPPED_ELIGIBLE_REASON_CODE]
        : RETURN_REASON_CODE_OPTIONS,
    [onlyItemNotReceived],
  );

  const [requestType, setRequestType] = useState<ReturnRequestType>(RETURN_REQUEST_TYPE.moneyRefund);
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>(reasonOptions[0]);
  const [explanation, setExplanation] = useState("");
  const explanationId = useId();
  const reasonSelectId = useId();

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  const trimmedExplanation = explanation.trim();
  const canSubmit = reasonCode !== "other" || trimmedExplanation.length > 0;

  return (
    <section aria-label="Report a problem with this order" className={cn(RJ_CARD, "p-5")}>
      <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-600">
        Report a Problem
      </h2>
      <p className="mt-1 text-xs text-rj-gray-600">
        Tell us what you&apos;d like, then what happened. Your seller will review it first; if they
        can&apos;t resolve it, an administrator will step in.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4" aria-busy={isPending}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="requestType" value={requestType} />
        <input type="hidden" name="reasonCode" value={reasonCode} />
        {reasonCode === "other" ? (
          <input type="hidden" name="explanation" value={trimmedExplanation} />
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-rj-black">What would you like?</legend>
          <ChoiceGroup
            label="What would you like?"
            variant="tile"
            options={REQUEST_TYPE_OPTIONS}
            value={requestType}
            onChange={setRequestType}
            className="sm:grid sm:grid-cols-3 sm:gap-2"
          />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonSelectId} className="text-sm font-medium text-rj-black">
            Reason
          </label>
          <select
            id={reasonSelectId}
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as ReturnReasonCode)}
            className="h-10 rounded-md border border-rj-gray-200 bg-rj-white px-3 text-sm text-rj-black outline-none transition-colors focus-visible:border-rj-black focus-visible:ring-2 focus-visible:ring-rj-red/30"
          >
            {reasonOptions.map((value) => (
              <option key={value} value={value}>
                {RETURN_REASON_CODE_LABELS[value]}
              </option>
            ))}
          </select>
          {onlyItemNotReceived ? (
            <p className="text-xs text-rj-gray-500">
              This order hasn&apos;t been marked delivered yet, so only &ldquo;Item Not
              Received&rdquo; can be reported right now.
            </p>
          ) : null}
          {fieldErrors?.reasonCode ? (
            <p role="alert" className="text-xs text-rj-red-dark">
              {fieldErrors.reasonCode[0]}
            </p>
          ) : null}
        </div>

        {reasonCode === "other" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={explanationId} className="text-sm font-medium text-rj-black">
              Describe the problem
            </label>
            <textarea
              id={explanationId}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value.slice(0, RETURN_EXPLANATION_MAX_LENGTH))}
              required
              maxLength={RETURN_EXPLANATION_MAX_LENGTH}
              rows={3}
              className="rounded-md border border-rj-gray-200 bg-rj-white px-3 py-2 text-sm text-rj-black outline-none transition-colors focus-visible:border-rj-black focus-visible:ring-2 focus-visible:ring-rj-red/30"
              placeholder="Tell us specifically what happened…"
              aria-describedby={`${explanationId}-count`}
            />
            <p id={`${explanationId}-count`} className="text-right text-[11px] text-rj-gray-500">
              {explanation.length}/{RETURN_EXPLANATION_MAX_LENGTH} characters
            </p>
            {fieldErrors?.explanation ? (
              <p role="alert" className="text-xs text-rj-red-dark">
                {fieldErrors.explanation[0]}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="evidence" className="text-sm font-medium text-rj-black">
            Evidence photo (optional)
          </label>
          <input
            id="evidence"
            name="evidence"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm text-rj-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-rj-black file:px-4 file:py-2 file:text-xs file:font-bold file:text-rj-white"
          />
          {fieldErrors?.evidence ? (
            <p role="alert" className="text-xs text-rj-red-dark">
              {fieldErrors.evidence[0]}
            </p>
          ) : null}
        </div>

        {formError ? (
          <ErrorState title="Couldn't submit your report" message={formError} />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="rj"
            size="rjSm"
            isLoading={isPending}
            disabled={!canSubmit}
          >
            {isPending ? "Submitting…" : "Submit report"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="rjOutline" size="rjSm" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
          ) : null}
        </div>
        {!canSubmit ? (
          <p className="text-xs text-rj-gray-500">Describe the problem before submitting.</p>
        ) : null}
      </form>
    </section>
  );
}
