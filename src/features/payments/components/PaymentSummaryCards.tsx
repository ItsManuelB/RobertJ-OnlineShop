import { StatCard } from "@/components/ui/stat-card";
import {
  PAYMENT_SOURCE_FILTER_OPTIONS,
  type PaymentSourceFilter,
} from "@/features/payments/lib/payment-source";
import type { PaymentHistorySummary } from "@/features/payments/types/payment.types";
import { formatCurrency } from "@/lib/utils/currency";

interface PaymentSummaryCardsProps {
  summary: PaymentHistorySummary;
  paymentSource?: PaymentSourceFilter;
  /** Seller layout: just the paid amount and attempts — the status counts live in the tabs. */
  compact?: boolean;
}

/** All matching payment attempts and settled amounts, across every table page. */
export function PaymentSummaryCards({ summary, paymentSource, compact = false }: PaymentSummaryCardsProps) {
  const sourceLabel = PAYMENT_SOURCE_FILTER_OPTIONS.find((option) => option.value === paymentSource)?.label
    ?? "All payment sources";

  return (
    <section aria-label={`Payment summary for ${sourceLabel}`} className="flex flex-col gap-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Payment summary · {sourceLabel}
      </p>
      <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"}>
        {compact ? null : <StatCard label="Payment attempts" value={summary.paymentCount} />}
        <StatCard
          label="Paid amount"
          value={formatCurrency(summary.paidAmountCents)}
          hint={`${summary.paidCount} paid payment${summary.paidCount === 1 ? "" : "s"}`}
        />
        {compact ? <StatCard label="Payment attempts" value={summary.paymentCount} /> : null}
        {compact ? null : <StatCard label="Pending" value={summary.pendingCount} />}
        {compact ? null : <StatCard label="Failed" value={summary.failedCount} />}
        {compact ? null : (
          <StatCard
            label="Refunded"
            value={summary.refundedCount}
            hint="Fully or partly refunded"
          />
        )}
      </div>
    </section>
  );
}
