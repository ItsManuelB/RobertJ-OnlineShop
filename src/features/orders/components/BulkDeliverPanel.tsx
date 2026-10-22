"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderItemThumbs } from "@/features/orders/components/OrderItemThumbs";
import { ShippedTrackingInfo } from "@/features/orders/components/ShippedTrackingInfo";
import { getBuyerDisplayName, type Order, type ShippedOrderInfo } from "@/features/orders/types/order.types";

export interface BulkDeliverPanelProps {
  /** Shipped orders only — the caller filters. */
  orders: Order[];
  shippedInfo: Record<string, ShippedOrderInfo> | undefined;
  orderHref: (id: string) => string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Review step before bulk Shipped → Delivered. Delivery is final (a delivered
 * order has no further transitions), so nothing is sent until the seller has
 * seen each order's courier/tracking and ticked the acknowledgement. COD cash
 * collection is deliberately not part of this — it's recorded separately.
 */
export function BulkDeliverPanel({
  orders,
  shippedInfo,
  orderHref,
  isPending,
  onConfirm,
  onCancel,
}: BulkDeliverPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const count = orders.length;
  const hasCod = orders.some((order) => order.paymentMethod === "cod");

  return (
    <section
      aria-label="Review orders before marking delivered"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="text-sm font-bold text-foreground">
          Mark {count} order{count === 1 ? "" : "s"} delivered?
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivered orders can&apos;t be moved back. If a delivery failed, open that order and use
          &quot;Report failed delivery&quot; instead.
        </p>
      </div>

      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {orders.map((order) => (
          <li key={order.id} className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <OrderItemThumbs items={order.items} size="sm" />
              <div className="min-w-0">
                <Link href={orderHref(order.id)} className="text-sm font-semibold text-foreground hover:underline">
                  {order.orderNumber}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{getBuyerDisplayName(order)}</p>
              </div>
            </div>
            <div className="sm:w-56">
              <ShippedTrackingInfo info={shippedInfo?.[order.id]} />
            </div>
          </li>
        ))}
      </ul>

      {hasCod ? (
        <p className="text-xs text-muted-foreground">
          COD payment collection is recorded separately — marking delivered does not mark the cash as collected.
        </p>
      ) : null}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <Checkbox checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        I&apos;ve confirmed these {count} order{count === 1 ? " was" : "s were"} delivered.
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="rjSm" isLoading={isPending} disabled={!acknowledged} onClick={onConfirm}>
          Mark {count} delivered
        </Button>
        <Button type="button" variant="outline" size="rjSm" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
