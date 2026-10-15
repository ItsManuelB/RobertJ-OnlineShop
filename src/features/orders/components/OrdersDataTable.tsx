"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { RowMenu } from "@/components/ui/row-menu";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { advanceOrderStatusAction, bulkCancelOrdersAction, bulkConfirmOrdersAction, exportOrdersAction } from "@/features/orders/actions/order.actions";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { PaymentStatusBadge } from "@/features/orders/components/PaymentStatusBadge";
import { OrderItemThumbs } from "@/features/orders/components/OrderItemThumbs";
import {
  getBuyerDisplayName,
  isOrderNeedingAttention,
  isShippingLabelEligible,
  summarizeOrderItems,
  type Order,
} from "@/features/orders/types/order.types";
import { downloadCsv } from "@/lib/utils/csv";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const CANCELLABLE = new Set(["pending", "confirmed", "processing"]);
/** Shared with the bulk shipping-labels page, which imports this instead of duplicating the number. */
export const MAX_SELECTION = 100;

export interface OrdersDataTableProps {
  orders: Order[];
  isAdmin: boolean;
}

function canConfirm(order: Order) {
  const blockedByPayment = order.paymentMethod === "xendit" && order.paymentStatus !== "paid";
  return order.status === "pending" && !blockedByPayment;
}

/**
 * Orders dashboard table — desktop `<table>` + `sm:hidden` card fallback,
 * checkbox multi-select driving a bulk-actions bar (Confirm/Cancel/Print
 * labels/Export), and a row menu for the same actions on one order. "Print
 * shipping label" stays seller-only (`!isAdmin`) — the Admin order detail
 * page never had this link either. The rich single-order flows (item
 * verification, shipment tracking capture) are untouched — they still live
 * only on the order detail page.
 */
export function OrdersDataTable({ orders, isAdmin }: OrdersDataTableProps) {
  const searchParams = useSearchParams();
  const orderHref = isAdmin ? ROUTES.adminOrderDetail : ROUTES.sellerOrderDetail;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmCancelIds, setConfirmCancelIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);

  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const someSelected = orders.some((o) => selected.has(o.id));
  const selectedCount = selected.size;
  const selectedOrders = orders.filter((o) => selected.has(o.id));
  const labelEligibleSelectedIds = selectedOrders.filter(isShippingLabelEligible).map((o) => o.id);

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(orders.slice(0, MAX_SELECTION).map((o) => o.id)));
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      if (checked && prev.size >= MAX_SELECTION) return prev;
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function clearFeedback() {
    setError(null);
    setNotice(null);
  }

  function formatOutcome(actionLabel: string, updated: number, failed: Array<{ orderId: string; error: string }>) {
    if (failed.length === 0) {
      setNotice(`${updated} order${updated === 1 ? "" : "s"} ${actionLabel}.`);
      return;
    }
    const byId = new Map(orders.map((o) => [o.id, o.orderNumber]));
    const reasons = failed.map((f) => `${byId.get(f.orderId) ?? f.orderId}: ${f.error}`).join("; ");
    setError(
      updated > 0
        ? `${updated} ${actionLabel}, ${failed.length} failed — ${reasons}`
        : `${failed.length} failed — ${reasons}`,
    );
  }

  function runBulkConfirm() {
    clearFeedback();
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await bulkConfirmOrdersAction(ids);
      if (!result.success) {
        setError(result.error);
        return;
      }
      formatOutcome("confirmed", result.data.updated, result.data.failed);
      setSelected(new Set());
    });
  }

  function runBulkCancel(ids: string[]) {
    clearFeedback();
    startTransition(async () => {
      const result = await bulkCancelOrdersAction(ids);
      if (!result.success) {
        setError(result.error);
        setConfirmCancelIds(null);
        return;
      }
      formatOutcome("cancelled", result.data.updated, result.data.failed);
      setSelected(new Set());
      setConfirmCancelIds(null);
    });
  }

  function runConfirmOne(orderId: string) {
    clearFeedback();
    startTransition(async () => {
      const result = await advanceOrderStatusAction(orderId, "confirmed");
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice("Order confirmed.");
    });
  }

  function runExport() {
    clearFeedback();
    startTransition(async () => {
      const filters = {
        search: searchParams.get("search") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        paymentMethod: searchParams.get("paymentMethod") ?? undefined,
        dateRange: searchParams.get("dateRange") ?? undefined,
        attentionOnly: searchParams.get("attentionOnly") ?? undefined,
      };
      const result = await exportOrdersAction(filters);
      if (!result.success) {
        setError(result.error);
        return;
      }
      downloadCsv(
        "orders.csv",
        [
          "Order #",
          "Buyer",
          ...(isAdmin ? ["Shop"] : []),
          "Items",
          "Total (PHP)",
          "Method",
          "Payment status",
          "Order status",
          "Placed",
        ],
        result.data.map((row) => [
          row.orderNumber,
          row.buyerName,
          ...(isAdmin ? [row.shopName ?? "—"] : []),
          row.itemCount,
          (row.totalCents / 100).toFixed(2),
          row.paymentMethod === "cod" ? "COD" : "Online",
          row.paymentStatus,
          row.status,
          formatDate(row.placedAt),
        ]),
      );
    });
  }

  function runExportSelected() {
    clearFeedback();
    const rows = selectedOrders;
    downloadCsv(
      "orders-selected.csv",
      [
        "Order #",
        "Buyer",
        ...(isAdmin ? ["Shop"] : []),
        "Items",
        "Total (PHP)",
        "Method",
        "Payment status",
        "Order status",
        "Placed",
      ],
      rows.map((o) => [
        o.orderNumber,
        o.buyerName,
        ...(isAdmin ? [o.shopName ?? "—"] : []),
        o.items.length,
        (o.totalCents / 100).toFixed(2),
        o.paymentMethod === "cod" ? "COD" : "Online",
        o.paymentStatus,
        o.status,
        formatDate(o.placedAt),
      ]),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="rjSm" onClick={runExport} isLoading={isPending && selectedCount === 0}>
          Export CSV
        </Button>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-semibold text-foreground">{selectedCount} selected</span>
          <span className="text-xs text-muted-foreground">(max {MAX_SELECTION} at a time)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {confirmCancelIds ? null : (
              <>
                <Button type="button" variant="outline" size="rjSm" onClick={runExportSelected}>
                  Export selected
                </Button>
                {!isAdmin ? (
                  labelEligibleSelectedIds.length > 0 ? (
                    <Link
                      href={ROUTES.sellerOrderLabels(labelEligibleSelectedIds)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
                    >
                      Print labels ({labelEligibleSelectedIds.length})
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
                    >
                      Print labels
                    </button>
                  )
                ) : null}
                <Button
                  type="button"
                  variant="primary"
                  size="rjSm"
                  isLoading={isPending}
                  disabled={selectedOrders.length === 0 || !selectedOrders.every(canConfirm)}
                  onClick={runBulkConfirm}
                >
                  Confirm orders
                </Button>
                <button
                  type="button"
                  ref={cancelTriggerRef}
                  disabled={selectedOrders.length === 0 || !selectedOrders.every((o) => CANCELLABLE.has(o.status))}
                  className={cn(buttonVariants({ variant: "danger", size: "rjSm" }))}
                  onClick={() => setConfirmCancelIds(Array.from(selected))}
                >
                  Cancel orders
                </button>
                <Button type="button" variant="ghost" size="rjSm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {confirmCancelIds && confirmCancelIds.length > 1 ? (
        <ConfirmPanel
          label={`Cancel ${confirmCancelIds.length} orders`}
          title={`Cancel ${confirmCancelIds.length} orders?`}
          description="This can't be undone. Stock is restocked automatically for each order."
          tone="danger"
          confirmLabel="Yes, cancel"
          pendingLabel="Cancelling…"
          isPending={isPending}
          triggerRef={cancelTriggerRef}
          onConfirm={() => runBulkCancel(confirmCancelIds)}
          onCancel={() => setConfirmCancelIds(null)}
        />
      ) : null}

      {error ? <ErrorState title="Something went wrong" message={error} /> : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      {/* ---------------- Desktop table ---------------- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="w-10 p-3">
                <Checkbox
                  checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all orders on this page"
                />
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</th>
              {isAdmin ? (
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shop</th>
              ) : null}
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placed</th>
              <th className="w-10 p-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const attention = isOrderNeedingAttention(order);
              return (
                <Fragment key={order.id}>
                  <tr
                    className={cn(
                      "border-b border-border last:border-0",
                      selected.has(order.id) && "bg-primary/5",
                      attention && "shadow-[inset_3px_0_0_0_var(--warning)]",
                    )}
                  >
                    <td className="p-3 align-top">
                      <Checkbox
                        checked={selected.has(order.id)}
                        onChange={(event) => toggleOne(order.id, event.target.checked)}
                        aria-label={`Select order ${order.orderNumber}`}
                      />
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-3">
                        <OrderItemThumbs items={order.items} />
                        <div className="min-w-0">
                          <Link href={orderHref(order.id)} className="block text-sm font-semibold text-foreground hover:underline">
                            {order.orderNumber}
                          </Link>
                          <p className="text-xs text-muted-foreground">{getBuyerDisplayName(order)}</p>
                        </div>
                      </div>
                    </td>
                    {isAdmin ? (
                      <td className="p-3 align-top text-sm text-muted-foreground">
                        {order.shopName ?? "—"}
                      </td>
                    ) : null}
                    <td className="p-3 align-top text-sm text-muted-foreground">
                      <p className="line-clamp-2 max-w-[16rem] text-foreground">{summarizeOrderItems(order.items)}</p>
                    </td>
                    <td className="p-3 align-top text-sm font-medium text-foreground">
                      {formatCurrency(order.totalCents, order.currency)}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-col gap-1">
                        <Badge tone="neutral">{order.paymentMethod === "cod" ? "COD" : "Online"}</Badge>
                        <PaymentStatusBadge status={order.paymentStatus} paymentMethod={order.paymentMethod} />
                      </div>
                    </td>
                    <td className="p-3 align-top"><OrderStatusBadge
                        status={order.status}
                        paymentStatus={order.paymentStatus}
                        paymentMethod={order.paymentMethod}
                      /></td>
                    <td className="p-3 align-top text-sm text-muted-foreground">{formatDate(order.placedAt)}</td>
                    <td className="p-3 align-top text-right">
                      <RowMenu open={openMenuId === order.id} onOpenChange={(open) => setOpenMenuId(open ? order.id : null)}>
                        <Link href={orderHref(order.id)} onClick={() => setOpenMenuId(null)} className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted">
                          View order
                        </Link>
                        {canConfirm(order) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              runConfirmOne(order.id);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            Confirm order
                          </button>
                        ) : null}
                        {!isAdmin && isShippingLabelEligible(order) ? (
                          <Link
                            href={ROUTES.sellerOrderLabel(order.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setOpenMenuId(null)}
                            className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            Print shipping label
                          </Link>
                        ) : null}
                        {CANCELLABLE.has(order.status) ? (
                          <>
                            <hr className="my-1 border-border" />
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setConfirmCancelIds([order.id]);
                              }}
                              className="w-full rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-danger/10"
                            >
                              Cancel order
                            </button>
                          </>
                        ) : null}
                      </RowMenu>
                    </td>
                  </tr>
                  {confirmCancelIds && confirmCancelIds.length === 1 && confirmCancelIds[0] === order.id ? (
                    <tr>
                      <td colSpan={isAdmin ? 9 : 8} className="border-b border-border bg-muted p-4">
                        <ConfirmPanel
                          label={`Cancel order ${order.orderNumber}`}
                          title={`Cancel order ${order.orderNumber}?`}
                          description="This can't be undone. Stock is restocked automatically."
                          tone="danger"
                          confirmLabel="Yes, cancel order"
                          pendingLabel="Cancelling…"
                          isPending={isPending}
                          onConfirm={() => runBulkCancel([order.id])}
                          onCancel={() => setConfirmCancelIds(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------- Mobile cards ---------------- */}
      <div className="flex flex-col gap-3 sm:hidden">
        {orders.map((order) => (
          <Card key={order.id} className={cn(selected.has(order.id) && "ring-2 ring-primary")}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(order.id)}
                  onChange={(event) => toggleOne(order.id, event.target.checked)}
                  aria-label={`Select order ${order.orderNumber}`}
                  className="mt-1"
                />
                <OrderItemThumbs items={order.items} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {getBuyerDisplayName(order)}
                    {isAdmin ? ` · ${order.shopName ?? "—"}` : ""} · {formatCurrency(order.totalCents, order.currency)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-foreground">{summarizeOrderItems(order.items)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <OrderStatusBadge
                        status={order.status}
                        paymentStatus={order.paymentStatus}
                        paymentMethod={order.paymentMethod}
                      />
                    <PaymentStatusBadge status={order.paymentStatus} paymentMethod={order.paymentMethod} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={orderHref(order.id)} className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}>
                  View order
                </Link>
                {canConfirm(order) ? (
                  <Button type="button" variant="primary" size="rjSm" onClick={() => runConfirmOne(order.id)}>
                    Confirm
                  </Button>
                ) : null}
                {!isAdmin && isShippingLabelEligible(order) ? (
                  <Link href={ROUTES.sellerOrderLabel(order.id)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}>
                    Print label
                  </Link>
                ) : null}
                {CANCELLABLE.has(order.status) ? (
                  <button type="button" className={cn(buttonVariants({ variant: "danger", size: "rjSm" }))} onClick={() => setConfirmCancelIds([order.id])}>
                    Cancel
                  </button>
                ) : null}
              </div>
              {confirmCancelIds && confirmCancelIds.length === 1 && confirmCancelIds[0] === order.id ? (
                <ConfirmPanel
                  label={`Cancel order ${order.orderNumber}`}
                  title={`Cancel order ${order.orderNumber}?`}
                  description="This can't be undone. Stock is restocked automatically."
                  tone="danger"
                  confirmLabel="Yes, cancel order"
                  pendingLabel="Cancelling…"
                  isPending={isPending}
                  onConfirm={() => runBulkCancel([order.id])}
                  onCancel={() => setConfirmCancelIds(null)}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
