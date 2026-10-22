"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmXenditPaymentAction } from "@/features/payments/actions/xendit.actions";

type WatcherTarget = { orderId: string; checkoutGroupId?: undefined } | { orderId?: undefined; checkoutGroupId: string };

type PaymentStatusWatcherProps = WatcherTarget & {
  /** Runs once when the payment is confirmed paid. Defaults to refreshing the page, so server-rendered status and redirects update. */
  onPaid?: () => void;
  /** Runs once when watching gives up (still pending after `maxWaitMs`) — lets a flow move on instead of leaving the buyer stuck. */
  onGiveUp?: () => void;
  intervalMs?: number;
  maxWaitMs?: number;
};

type Phase = "watching" | "paid" | "failed" | "gave-up";

/**
 * Real-time "confirming your payment" watcher. Every few seconds it asks the
 * server to check the payment with Xendit (`confirmXenditPaymentAction`), so a
 * paid order updates within moments of paying even if Xendit's webhook is late
 * or can't reach us. Stops on paid/failed, after `maxWaitMs`, or on unmount;
 * a manual "Check again" restarts it. Never decides anything itself — it only
 * displays what the server reports.
 */
export function PaymentStatusWatcher(props: PaymentStatusWatcherProps) {
  const { onPaid, onGiveUp, intervalMs = 2500, maxWaitMs = 120_000 } = props;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("watching");
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onPaid, onGiveUp });
  // Keep the latest callbacks without restarting the polling loop when a parent re-renders.
  useEffect(() => {
    callbacks.current = { onPaid, onGiveUp };
  });

  const orderId = props.orderId;
  const checkoutGroupId = props.checkoutGroupId;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    async function poll() {
      if (cancelled) return;
      const result = await confirmXenditPaymentAction(
        checkoutGroupId ? { checkoutGroupId } : { orderId },
      ).catch(() => null);
      if (cancelled) return;

      if (result?.success && result.data.status === "paid") {
        setPhase("paid");
        (callbacks.current.onPaid ?? (() => router.refresh()))();
        return;
      }
      if (result?.success && result.data.status === "failed") {
        setPhase("failed");
        router.refresh();
        return;
      }
      if (Date.now() - startedAt >= maxWaitMs) {
        setPhase("gave-up");
        callbacks.current.onGiveUp?.();
        return;
      }
      timer = window.setTimeout(poll, intervalMs);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [orderId, checkoutGroupId, intervalMs, maxWaitMs, attempt, router]);

  if (phase === "paid") {
    return (
      <p role="status" className="text-sm font-medium text-rj-green">
        Payment confirmed. Thank you!
      </p>
    );
  }
  if (phase === "failed") {
    return (
      <p role="status" className="text-sm font-medium text-rj-red-dark">
        This payment did not go through. You can try again below.
      </p>
    );
  }
  if (phase === "gave-up") {
    return (
      <div className="flex flex-col gap-2">
        <p role="status" className="text-xs text-rj-gray-600">
          We haven&apos;t received confirmation from your payment provider yet. If you already paid, it
          usually appears within a minute.
        </p>
        <Button type="button" variant="rjOutline" size="rjSm" className="w-fit" onClick={() => {
            setPhase("watching");
            setAttempt((n) => n + 1);
          }}>
          Check again
        </Button>
      </div>
    );
  }
  return (
    <p role="status" className="text-xs text-rj-gray-600">
      Confirming your payment with Xendit… this page updates by itself.
    </p>
  );
}
