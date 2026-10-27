"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { RowMenu } from "@/components/ui/row-menu";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { PaymentStatusBadge } from "@/features/orders/components/PaymentStatusBadge";
import { bulkMarkCodPaymentCollectedAction, exportPaymentsAction } from "@/features/payments/actions/payment.actions";
import type { Payment } from "@/features/payments/types/payment.types";
import { PAYMENT_SOURCE_DOT, paymentSourceOf, paymentSourceCsvLabel } from "@/features/payments/lib/payment-source";
import { downloadCsv } from "@/lib/utils/csv";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const MAX_SELECTION = 100;

export interface PaymentsDataTableProps {
  /**
   * `receiptUrl`/`stale` are computed server-side in `PaymentsList` —
   * `receiptUrl` resolves a signed URL for a private bucket (null unless
   * this is a legacy `qr_upload` row with a receipt); `stale` is
   * `isStaleXenditAttempt()`'s result, computed there because that helper's
   * module transitively imports the server-only query layer and can't be
   * called from this client component.
   */
  payments: Array<Payment & { receiptUrl: string | null; stale: boolean }>;
  /** Phase 4B extras (stale/multi-seller badges) — Admin only, same gate `PaymentsList` already used. */
  showAdminTools?: boolean;
}

function initials(name: string) {
  const words = name.split(" ").filter(Boolean);
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

function canCollect(payment: Payment) {
  return payment.paymentMethodType === "cod" && payment.status === "pending";
}

function methodLabel(payment: Payment) {
  return paymentSourceOf(payment);
}

function PaymentSourceChip({ payment }: { payment: Payment }) {
  const source = methodLabel(payment);
  return (
    <div className="min-w-0">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PAYMENT_SOURCE_DOT[source.key]}`} />
        <span className="truncate">{source.label}</span>
      </span>
      {source.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{source.detail}</p> : null}
    </div>
  );
}

/**
 * Payments dashboard table — desktop `<table>` + `sm:hidden` card fallback,
 * checkbox multi-select driving a bulk "Mark COD collected" bar (confirm-
 * gated, since it's a money record), and per-row Mark collected/View order.
 * Xendit rows stay read-only — they settle via webhook, same as before.
 */
export function PaymentsDataTable({ payments, showAdminTools = false }: PaymentsDataTableProps) {
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSelected = payments.length > 0 && payments.every((p) => selected.has(p.id));
  const someSelected = payments.some((p) => selected.has(p.id));
  const selectedCount = selected.size;
  const selectedPayments = payments.filter((p) => selected.has(p.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(payments.slice(0, MAX_SELECTION).map((p) => p.id)) : new Set());
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

  function formatOutcome(updated: number, failed: Array<{ orderId: string; error: string }>) {
    if (failed.length === 0) {
      setNotice(`${updated} payment${updated === 1 ? "" : "s"} marked collected.`);
      return;
    }
    const byId = new Map(payments.map((p) => [p.orderId, p.orderNumber]));
    const reasons = failed.map((f) => `${byId.get(f.orderId) ?? f.orderId}: ${f.error}`).join("; ");
    setError(
      updated > 0
        ? `${updated} marked collected, ${failed.length} failed — ${reasons}`
        : `${failed.length} failed — ${reasons}`,
    );
  }

  function runBulkCollect(orderIds: string[]) {
    clearFeedback();
    startTransition(async () => {
      const result = await bulkMarkCodPaymentCollectedAction(orderIds);
      if (!result.success) {
        setError(result.error);
        setConfirming(null);
        return;
      }
      formatOutcome(result.data.updated, result.data.failed);
      setSelected(new Set());
      setConfirming(null);
    });
  }

  function runExport() {
    clearFeedback();
    startTransition(async () => {
      const filters = {
        search: searchParams.get("search") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        paymentMethodType: searchParams.get("paymentMethodType") ?? undefined,
        paymentSource: searchParams.get("paymentSource") ?? undefined,
        staleOnly: searchParams.get("staleOnly") ?? undefined,
      };
      const result = await exportPaymentsAction(filters);
      if (!result.success) {
        setError(result.error);
        return;
      }
      downloadCsv(
        "payments.csv",
        ["Order #", "Buyer", "Method", "Amount (PHP)", "Status", "Date"],
        result.data.map((row) => [
          row.orderNumber,
          row.buyerName,
          paymentSourceCsvLabel({ paymentMethodType: row.paymentMethodType, paymentChannel: row.paymentChannel }),
          (row.amountCents / 100).toFixed(2),
          row.status,
          formatDate(row.createdAt),
        ]),
      );
    });
  }

  function runExportSelected() {
    clearFeedback();
    downloadCsv(
      "payments-selected.csv",
      ["Order #", "Buyer", "Method", "Amount (PHP)", "Status", "Date"],
      selectedPayments.map((p) => [
        p.orderNumber,
        p.buyerName,
        paymentSourceCsvLabel(p),
        (p.amountCents / 100).toFixed(2),
        p.status,
        formatDate(p.createdAt),
      ]),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="rjSm" onClick={runExport} className="text-foreground">
          Export CSV
        </Button>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-semibold text-foreground">{selectedCount} selected</span>
          <span className="text-xs text-muted-foreground">(max {MAX_SELECTION} at a time)</span>
          {!selectedPayments.every(canCollect) ? (
            <span className="text-xs text-muted-foreground">Only pending COD payments can be marked collected — deselect the rest.</span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {confirming ? null : (
              <>
                <Button type="button" variant="outline" size="rjSm" onClick={runExportSelected}>
                  Export selected
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="rjSm"
                  disabled={selectedPayments.length === 0 || !selectedPayments.every(canCollect)}
                  onClick={() => setConfirming(Array.from(selected))}
                >
                  Mark COD collected
                </Button>
                <Button type="button" variant="ghost" size="rjSm" onClick={() => setSelected(new Set())}>
                  Clear selection
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmPanel
          label={`Mark ${confirming.length} payment${confirming.length === 1 ? "" : "s"} as collected`}
          title={`Mark ${confirming.length} COD payment${confirming.length === 1 ? "" : "s"} as collected?`}
          description="Confirm only once you've actually received the cash for every one of these orders."
          tone="neutral"
          confirmLabel="Yes, mark collected"
          pendingLabel="Saving…"
          cancelLabel="Not yet"
          isPending={isPending}
          onConfirm={() => {
            const orderIds = payments.filter((p) => confirming.includes(p.id)).map((p) => p.orderId);
            runBulkCollect(orderIds);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {error ? <ErrorState title="Something went wrong" message={error} /> : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      {/* ---------------- Desktop table ---------------- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th scope="col" className="w-10 p-3">
                <Checkbox
                  checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all payments on this page"
                />
              </th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Method</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
              <th scope="col" className="w-10 p-3" />
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => {
              const stale = payment.stale;
              const multi = showAdminTools && Boolean(payment.checkoutGroupId);
              return (
                <tr key={payment.id} className={cn("border-b border-border last:border-0", selected.has(payment.id) && "bg-primary/5")}>
                  <td className="p-3 align-top">
                    <Checkbox
                      checked={selected.has(payment.id)}
                      onChange={(event) => toggleOne(payment.id, event.target.checked)}
                      aria-label={`Select payment for ${payment.orderNumber}`}
                    />
                  </td>
                  <td className="p-3 align-top">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                        {initials(payment.buyerName ?? "?")}
                      </div>
                      <div className="min-w-0">
                        <Link href={ROUTES.orderDetail(payment.orderId)} className="block text-sm font-semibold text-foreground hover:underline">
                          {payment.orderNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">{payment.buyerName ?? "Buyer"}</p>
                        {payment.status === "failed" && payment.failureReason ? (
                          <p className="mt-0.5 text-xs text-danger">{payment.failureReason}</p>
                        ) : null}
                        {payment.receiptUrl ? (
                          <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-xs font-semibold text-danger hover:underline">
                            View receipt
                          </a>
                        ) : null}
                        {multi || stale ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {multi ? <Badge tone="neutral">Multi-seller order</Badge> : null}
                            {stale ? <Badge tone="warning">Stale — awaiting reconciliation</Badge> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 align-top">
                    <PaymentSourceChip payment={payment} />
                  </td>
                  <td className="p-3 align-top text-sm font-medium text-foreground">{formatCurrency(payment.amountCents, payment.currency)}</td>
                  <td className="p-3 align-top"><PaymentStatusBadge status={payment.status} paymentMethod={payment.paymentMethodType} /></td>
                  <td className="p-3 align-top text-sm text-muted-foreground">{formatDate(payment.createdAt)}</td>
                  <td className="p-3 align-top text-right">
                    <RowMenu open={openMenuId === payment.id} onOpenChange={(open) => setOpenMenuId(open ? payment.id : null)}>
                      <Link href={ROUTES.orderDetail(payment.orderId)} onClick={() => setOpenMenuId(null)} className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted">
                        View order
                      </Link>
                      {canCollect(payment) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setConfirming([payment.id]);
                          }}
                          className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                          Mark COD collected
                        </button>
                      ) : null}
                    </RowMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------- Mobile cards ---------------- */}
      <div className="flex flex-col gap-3 sm:hidden">
        {payments.map((payment) => {
          const stale = payment.stale;
          const multi = showAdminTools && Boolean(payment.checkoutGroupId);
          return (
            <Card key={payment.id} className={cn(selected.has(payment.id) && "ring-2 ring-primary")}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(payment.id)}
                    onChange={(event) => toggleOne(payment.id, event.target.checked)}
                    aria-label={`Select payment for ${payment.orderNumber}`}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{payment.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.buyerName ?? "Buyer"} · {methodLabel(payment).label} · {formatCurrency(payment.amountCents, payment.currency)}
                    </p>
                    {payment.status === "failed" && payment.failureReason ? (
                      <p className="mt-0.5 text-xs text-danger">{payment.failureReason}</p>
                    ) : null}
                    {payment.receiptUrl ? (
                      <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-xs font-semibold text-danger hover:underline">
                        View receipt
                      </a>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <PaymentStatusBadge status={payment.status} paymentMethod={payment.paymentMethodType} />
                      {multi ? <Badge tone="neutral">Multi-seller order</Badge> : null}
                      {stale ? <Badge tone="warning">Stale — awaiting reconciliation</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={ROUTES.orderDetail(payment.orderId)} className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}>
                    View order
                  </Link>
                  {canCollect(payment) ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="rjSm"
                      onClick={() => setConfirming([payment.id])}
                    >
                      Mark collected
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
