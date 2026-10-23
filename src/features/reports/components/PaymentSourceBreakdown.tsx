import { PAYMENT_SOURCE_DOT, PAYMENT_SOURCE_LABELS, type PaymentSourceKey } from "@/features/payments/lib/payment-source";
import type { ReportFilters, PaymentSourceSummaryRow } from "@/features/reports/types/report.types";
import { getPaymentSourceSummary } from "@/lib/supabase/queries";
import { formatCurrency } from "@/lib/utils/currency";

const ALWAYS_SHOWN: PaymentSourceKey[] = ["cod", "gcash", "paymaya", "xendit_card"];

/** Source split for settled order revenue, sharing MANNA Finance's explicit labels, totals and unknown-source handling. */
export async function PaymentSourceBreakdown({
  filters,
  grossCents,
}: {
  filters: ReportFilters;
  /** When given, a check line shows whether the source total equals Gross sales for the same dates. */
  grossCents?: number;
}) {
  let sources: PaymentSourceSummaryRow[];
  try {
    sources = await getPaymentSourceSummary(filters.from, filters.to, filters.shopId);
  } catch {
    return <p className="text-sm text-muted-foreground">Payment source totals could not be loaded. Other report totals are unaffected.</p>;
  }

  const bySource = new Map(sources.map((row) => [row.source, row]));
  const sourceKeys = [
    ...ALWAYS_SHOWN,
    ...sources
      .filter((row) => row.orderCount > 0 && !ALWAYS_SHOWN.includes(row.source))
      .map((row) => row.source),
  ];
  const totalOrders = sources.reduce((sum, row) => sum + row.orderCount, 0);
  const totalCents = sources.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-foreground">Gross paid by payment source</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(totalCents)} · {totalOrders} paid order{totalOrders === 1 ? "" : "s"}
        </p>
      </div>

      {totalCents > 0 ? (
        <div
          className="flex h-3 overflow-hidden rounded-sm bg-muted"
          role="img"
          aria-label={`Gross paid by payment source: ${sourceKeys
            .map((key) => {
              const row = bySource.get(key);
              return row && row.amountCents > 0
                ? `${PAYMENT_SOURCE_LABELS[key]} ${(row.amountCents / totalCents * 100).toFixed(1)} percent`
                : null;
            })
            .filter(Boolean)
            .join(", ")}`}
        >
          {sourceKeys.map((key) => {
            const row = bySource.get(key);
            if (!row || row.amountCents <= 0) return null;
            return (
              <span
                key={key}
                className={PAYMENT_SOURCE_DOT[key]}
                style={{ width: `${(row.amountCents / totalCents) * 100}%` }}
                title={`${PAYMENT_SOURCE_LABELS[key]}: ${formatCurrency(row.amountCents)}`}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No paid orders in this range yet.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <caption className="sr-only">Paid order totals by payment source</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="pb-1 pr-3 font-medium">Payment source</th>
              <th scope="col" className="px-3 pb-1 text-right font-medium">Orders</th>
              <th scope="col" className="px-3 pb-1 text-right font-medium">Gross paid</th>
              <th scope="col" className="pb-1 pl-3 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {sourceKeys.map((key) => {
              const row = bySource.get(key);
              const count = row?.orderCount ?? 0;
              const amountCents = row?.amountCents ?? 0;
              return (
                <tr key={key} className="border-t border-border">
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${PAYMENT_SOURCE_DOT[key]}`} />
                      {PAYMENT_SOURCE_LABELS[key]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{count}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatCurrency(amountCents)}</td>
                  <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">
                    {totalCents > 0 ? `${((amountCents / totalCents) * 100).toFixed(1)}%` : "0.0%"}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-border font-semibold">
              <td className="pt-2 pr-3">Total paid</td>
              <td className="px-3 pt-2 text-right tabular-nums">{totalOrders}</td>
              <td className="px-3 pt-2 text-right tabular-nums">{formatCurrency(totalCents)}</td>
              <td className="pt-2 pl-3 text-right tabular-nums">{totalCents > 0 ? "100.0%" : "0.0%"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {grossCents !== undefined ? (
        <p className={totalCents === grossCents ? "text-xs text-success" : "text-xs font-semibold text-danger"}>
          {totalCents === grossCents
            ? `✓ Matches Gross sales (${formatCurrency(grossCents)}) for the same dates.`
            : `Does not match Gross sales (${formatCurrency(grossCents)}) for the same dates.`}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Based on orders placed in the selected period and their latest successful payment. Pending orders and provider fees are excluded.</p>
    </div>
  );
}
