"use client";

import { useRef, useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { cn } from "@/lib/utils/cn";
import { deleteDemoReviewsAction, setDemoContentAction } from "@/features/reviews/actions/review.actions";

export interface DemoContentPanelProps {
  enabled: boolean;
  count: number;
  products: number;
}

/**
 * Admin › Settings: show or hide every demo (sample) review, or delete them for good. While
 * on, every visitor sees them, each tagged "Sample". Real reviews are never affected; demo
 * reviews never count as verified, never change sales or stock, and are never sent to
 * search engines.
 */
export function DemoContentPanel({ enabled, count, products }: DemoContentPanelProps) {
  const [isOn, setIsOn] = useState(enabled);
  const [remaining, setRemaining] = useState(count);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    const next = !isOn;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await setDemoContentAction(next);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsOn(result.data);
      setMessage(result.data ? "Sample reviews are now showing in the store." : "Sample reviews are now hidden everywhere.");
    });
  }

  function remove() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteDemoReviewsAction();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      setRemaining(0);
      setIsOn(false);
      setMessage(`Removed ${result.data} sample review${result.data === 1 ? "" : "s"}.`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-medium text-foreground" id="demo-switch-label">
            Show sample reviews
          </p>
          <p className="text-xs text-muted-foreground">
            {remaining === 0
              ? "There are no sample reviews in the store."
              : isOn
                ? `${remaining} sample reviews are showing on ${products} products, each tagged “Sample”.`
                : `${remaining} sample reviews are hidden everywhere. Real reviews are unaffected.`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-labelledby="demo-switch-label"
          disabled={isPending || remaining === 0}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 ${isOn ? "bg-primary" : "bg-muted-foreground/40"}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-[left] ${isOn ? "left-[1.375rem]" : "left-0.5"}`}
          />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Sample reviews never count as verified purchases, never change sales or stock, and are never sent to
        search engines.
      </p>

      {remaining > 0 ? (
        confirming ? (
          <ConfirmPanel
            label="Remove demo content"
            title={`Delete all ${remaining} sample reviews?`}
            description="This cannot be undone. Real reviews are not touched."
            tone="danger"
            confirmLabel="Delete sample reviews"
            pendingLabel="Removing…"
            isPending={isPending}
            onConfirm={remove}
            onCancel={() => setConfirming(false)}
            triggerRef={triggerRef}
          />
        ) : (
          <button
            ref={triggerRef}
            type="button"
            className={cn(buttonVariants({ variant: "danger", size: "sm" }), "self-start")}
            onClick={() => setConfirming(true)}
          >
            Remove demo content
          </button>
        )
      ) : null}

      {message ? (
        <p className="text-xs font-semibold text-success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
