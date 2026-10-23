"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { confirmReplacementReceivedAction } from "@/features/returns/actions/return.actions";
import { REPLACEMENT_AUTO_COMPLETE_DAYS } from "@/features/returns/constants/return.constants";

export interface ConfirmReplacementReceivedPanelProps {
  returnId: string;
}

/**
 * Buyer-only: confirms the replacement arrived. Only rendered by the caller
 * while `status === 'replacement_shipped'`. If the buyer does nothing it
 * completes by itself after `REPLACEMENT_AUTO_COMPLETE_DAYS`.
 */
export function ConfirmReplacementReceivedPanel({ returnId }: ConfirmReplacementReceivedPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmReplacementReceivedAction(returnId);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rj-gray-100 bg-white p-5">
      {error ? <ErrorState title="Couldn't confirm your replacement" message={error} /> : null}
      <div>
        <p className="text-sm font-semibold text-rj-black">Did your replacement arrive?</p>
        <p className="mt-1 text-xs text-rj-gray-600">
          Confirm once you have it. If you don&apos;t, this closes by itself {REPLACEMENT_AUTO_COMPLETE_DAYS} days
          after it was shipped.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="rj" size="rjSm" isLoading={isPending} onClick={confirm}>
          I received my replacement
        </Button>
      </div>
    </div>
  );
}
