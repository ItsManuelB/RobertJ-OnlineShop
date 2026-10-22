import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { PaymentAttentionStrip } from "@/features/payments/components/PaymentAttentionStrip";
import { PaymentSummaryCards } from "@/features/payments/components/PaymentSummaryCards";
import { PaymentsDataTable } from "@/features/payments/components/PaymentsDataTable";
import { dashboardPaymentListParamsSchema } from "@/features/payments/schemas/payment.schema";
import type {
  DashboardPaymentListParams,
  Payment,
  PaymentHistorySummary,
} from "@/features/payments/types/payment.types";
import { isStaleXenditAttempt } from "@/features/payments/lib/xendit-reconciliation";
import {
  getPaymentHistorySummary,
  getPaymentReceiptSignedUrl,
  getStalePaymentCount,
  listPaymentHistory,
} from "@/lib/supabase/queries";
import type { PaginatedResult } from "@/types/pagination.types";

export interface PaymentsListProps {
  searchParams: Record<string, string | string[] | undefined>;
  /**
   * Phase 4B, Admin-only extras (stale/multi-seller indicators + the "needs
   * reconciliation" strip). Defaults to false so the Seller payments page
   * stays visually unchanged from before.
   */
  showAdminTools?: boolean;
}

/**
 * Read-only payment history — no manual verification actions beyond "Mark
 * COD collected" (single-row and bulk). Xendit payments settle themselves
 * via webhook; there's nothing else left to manually decide here, unlike
 * the retired QR verification queue.
 */
export async function PaymentsList({ searchParams, showAdminTools = false }: PaymentsListProps) {
  const parsed = dashboardPaymentListParamsSchema.safeParse(searchParams);
  if (!parsed.success) {
    return <ErrorState message="Those filters aren't valid. Try clearing your search." />;
  }

  const params: DashboardPaymentListParams = parsed.data;

  let result: PaginatedResult<Payment>;
  let summary: PaymentHistorySummary;
  let staleCount = 0;
  try {
    if (showAdminTools) {
      [result, summary, staleCount] = await Promise.all([
        listPaymentHistory(params),
        getPaymentHistorySummary(params),
        getStalePaymentCount(),
      ]);
    } else {
      [result, summary] = await Promise.all([
        listPaymentHistory(params),
        getPaymentHistorySummary(params),
      ]);
    }
  } catch {
    return <ErrorState message="We couldn't load payment history right now." />;
  }

  const { items, page, totalPages, total } = result;
  const filtering = Boolean(params.search || params.status || params.paymentMethodType || params.paymentSource || params.staleOnly);

  // Legacy QR receipts are stored in a private bucket — resolve a short-lived
  // signed URL per row here (server-side) so the (client) data table can
  // just render a plain link, same as the pre-redesign list did. `stale` is
  // computed here too (not inside the client component) since
  // `isStaleXenditAttempt` lives in a module that transitively imports the
  // server-only query layer.
  const withReceipts = await Promise.all(
    items.map(async (payment) => ({
      ...payment,
      receiptUrl:
        payment.paymentMethodType === "qr_upload" && payment.receiptPath
          ? await getPaymentReceiptSignedUrl(payment.receiptPath).catch(() => null)
          : null,
      stale:
        showAdminTools &&
        payment.paymentMethodType === "xendit" &&
        payment.status === "pending" &&
        payment.xenditPaymentRequestId != null &&
        isStaleXenditAttempt(payment),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      {showAdminTools ? <PaymentAttentionStrip staleCount={staleCount} /> : null}
      <PaymentSummaryCards summary={summary} paymentSource={params.paymentSource} />

      {items.length === 0 ? (
        filtering ? (
          <EmptyState title="No matching payments" description="Try a different search term or filter." />
        ) : (
          <EmptyState title="No payments yet" description="Payments will appear here once orders come in." />
        )
      ) : (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground" aria-live="polite">
            {total} payment{total === 1 ? "" : "s"}
          </p>
          <PaymentsDataTable payments={withReceipts} showAdminTools={showAdminTools} />
          {totalPages > 1 ? <PaginationControls page={page} totalPages={totalPages} themed /> : null}
        </>
      )}
    </div>
  );
}
