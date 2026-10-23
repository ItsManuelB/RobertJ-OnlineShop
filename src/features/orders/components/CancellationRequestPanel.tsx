"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { respondToCancellationRequestAction } from "@/features/orders/actions/order.actions";
import { cn } from "@/lib/utils/cn";

/**
 * Seller / admin review of a buyer's "please cancel" request on an order that is
 * already being prepared. Approving cancels the order and refunds a paid one
 * automatically; declining needs a reason the buyer will see, and leaves the
 * order active. Buttons disable while the request runs, and the database makes
 * a repeated click harmless.
 */
export function CancellationRequestPanel({
  requestId,
  reason,
  paidOnline,
}: {
  requestId: string;
  reason: string;
  paidOnline: boolean;
}) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function respond(decision: "approve" | "reject") {
    setError(null);
    startTransition(async () => {
      const result = await respondToCancellationRequestAction(requestId, decision, note || undefined);
      if (!result.success) setError(result.error);
      else setMessage(result.data.message);
    });
  }

  if (message) {
    return (
      <p role="status" className={cn(RJ_CARD, "p-4 text-sm text-rj-black")}>
        {message}
      </p>
    );
  }

  return (
    <section aria-label="Cancellation request" className={cn(RJ_CARD, "flex flex-col gap-3 p-5")}>
      <h2 className="text-sm font-semibold text-rj-black">The buyer asked to cancel this order</h2>
      <p className="text-xs text-rj-gray-600">Reason: “{reason}”</p>
      <p className="text-xs text-rj-gray-600">
        {paidOnline
          ? "If you approve, the order is cancelled, the items go back into stock and the buyer is refunded automatically."
          : "If you approve, the order is cancelled and the items go back into stock. Nothing was paid online."}
      </p>
      {declining ? (
        <label className="flex flex-col gap-1 text-xs text-rj-gray-600">
          Why can&apos;t you cancel it? (the buyer will see this)
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {declining ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending || !note.trim()}
              onClick={() => respond("reject")}
            >
              {isPending ? "Sending…" : "Send decline"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setDeclining(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" disabled={isPending} onClick={() => respond("approve")}>
              {isPending ? "Approving…" : "Approve cancellation"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setDeclining(true)}>
              Decline
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-rj-red">
          {error}
        </p>
      ) : null}
    </section>
  );
}
