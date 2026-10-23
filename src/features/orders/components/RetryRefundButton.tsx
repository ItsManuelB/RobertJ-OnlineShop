"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { retryOrderRefundAction } from "@/features/orders/actions/order.actions";

/**
 * Seller / admin recovery for a refund that failed. The database refuses a new
 * attempt while one is pending or already succeeded, so a click can never
 * refund twice; the button also disables itself while the request runs.
 */
export function RetryRefundButton({
  returnRequestId,
  orderId,
}: {
  returnRequestId: string;
  orderId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await retryOrderRefundAction(returnRequestId, orderId);
            if (!result.success) setError(result.error);
          });
        }}
      >
        {isPending ? "Retrying…" : "Retry refund"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-rj-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
