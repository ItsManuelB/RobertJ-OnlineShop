"use client";

import { useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { cn } from "@/lib/utils/cn";
import { setReviewHiddenAction } from "@/features/reviews/actions/review.actions";

/** Admin: hide a review from the store with a reason, or show it again. Nothing is deleted. */
export function ReviewModerationControls({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function run(nextHidden: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setReviewHiddenAction({ reviewId, hidden: nextHidden, reason: reason.trim() || undefined });
      if (!result.success) {
        setError(result.fieldErrors?.reason?.[0] ?? result.error);
        return;
      }
      setConfirming(false);
      setReason("");
    });
  }

  if (hidden) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button type="button" variant="outline" size="sm" className="self-start" isLoading={isPending} onClick={() => run(false)}>
          Show in store again
        </Button>
        {error ? (
          <p className="text-xs font-semibold text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
        onClick={() => setConfirming(true)}
      >
        Hide from store
      </button>
    );
  }

  return (
    <ConfirmPanel
      label="Hide review"
      title="Hide this review from the store?"
      description="It leaves the product page and the average. The buyer and the shop still see it, marked hidden. You can show it again later."
      tone="danger"
      confirmLabel="Hide review"
      pendingLabel="Hiding…"
      isPending={isPending}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => run(true)}
      onCancel={() => setConfirming(false)}
      triggerRef={triggerRef}
    >
      <label htmlFor={`hide-reason-${reviewId}`} className="text-xs font-semibold text-foreground">
        Reason (required, kept in the audit log)
      </label>
      <input
        id={`hide-reason-${reviewId}`}
        value={reason}
        maxLength={300}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. Offensive language, not about the product"
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {error ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmPanel>
  );
}
