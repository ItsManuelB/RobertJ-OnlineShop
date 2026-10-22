"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { ORDER_STATUS } from "@/constants/status";
import {
  advanceOrderStatusAction,
  type ScannedOrderSummary,
} from "@/features/orders/actions/order.actions";
import { OrderItemThumbs } from "@/features/orders/components/OrderItemThumbs";
import { cn } from "@/lib/utils/cn";

export interface ScanPackConfirmDialogProps {
  orderId: string;
  summary: ScannedOrderSummary;
  onClose: () => void;
}

/**
 * Shown when a seller scans a To Pack order's shipping label from the Orders
 * list. Scanning alone never changes the order — the seller reviews what's in
 * the box and either confirms here (To Pack → Ready for Pickup, through the
 * same `advanceOrderStatusAction` write path as the detail page) or opens the
 * order. Opening the order keeps the full item-verification checklist.
 */
export function ScanPackConfirmDialog({ orderId, summary, onClose }: ScanPackConfirmDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await advanceOrderStatusAction(orderId, ORDER_STATUS.processing);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Order ${summary.orderNumber}`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl bg-card p-5 text-card-foreground shadow-xl">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {done ? "Ready for pickup" : "Mark this order ready for pickup?"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.orderNumber}
            {summary.buyerName ? ` · ${summary.buyerName}` : ""}
          </p>
        </div>

        {done ? (
          <p className="text-sm text-success">Order {summary.orderNumber} is now Ready for Pickup.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <OrderItemThumbs items={summary.items} />
              <p className="text-xs text-muted-foreground">
                {summary.items.length} item{summary.items.length === 1 ? "" : "s"}
              </p>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {summary.items.map((item) => (
                <li key={item.id} className="rounded-md border border-border p-2">
                  <span className="block font-semibold text-foreground">{item.productTitle}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.variantLabel ? `${item.variantLabel} · ` : ""}Qty {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Make sure every item above is in the box before confirming.
            </p>
          </>
        )}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {done ? (
            <Button type="button" variant="primary" size="rjSm" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="primary" size="rjSm" isLoading={isPending} onClick={confirm}>
                Mark ready for pickup
              </Button>
              <Link
                href={ROUTES.sellerOrderDetail(orderId)}
                className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
              >
                Open order
              </Link>
              <button
                type="button"
                disabled={isPending}
                onClick={onClose}
                className={cn(buttonVariants({ variant: "ghost", size: "rjSm" }))}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
