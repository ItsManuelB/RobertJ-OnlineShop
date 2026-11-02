import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { PaymentAttentionStrip } from "@/features/payments/components/PaymentAttentionStrip";
import { PaymentMethodFilter } from "@/features/payments/components/PaymentMethodFilter";
import { PaymentSearchInput } from "@/features/payments/components/PaymentSearchInput";
import { PaymentsList } from "@/features/payments/components/PaymentsList";
import { PaymentStatusFilter } from "@/features/payments/components/PaymentStatusFilter";
import { getPaymentStatusCounts, getStalePaymentCount } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Payments — Admin Portal" };

function PaymentsListSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">Loading payment history</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      {Array.from({ length: 3 }).map((_, index) => <Skeleton key={`row-${index}`} className="h-20 w-full rounded-2xl" />)}
    </div>
  );
}

interface AdminPaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPaymentsPage({ searchParams }: AdminPaymentsPageProps) {
  const params = await searchParams;
  // The tab numbers and reconciliation banner are a nicety — a failed count just leaves them out.
  const [statusCounts, staleCount] = await Promise.all([
    getPaymentStatusCounts().catch(() => undefined),
    getStalePaymentCount().catch(() => 0),
  ]);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Reconcile online payments and record cash collected on delivery.
        </p>
      </div>

      <Suspense fallback={null}>
        <PaymentAttentionStrip staleCount={staleCount} />
      </Suspense>

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <PaymentStatusFilter counts={statusCounts} />
        </Suspense>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] flex-1">
            <Suspense fallback={null}>
              <PaymentSearchInput />
            </Suspense>
          </div>
          <Suspense fallback={null}>
            <PaymentMethodFilter />
          </Suspense>
        </div>
      </div>

      <Suspense key={JSON.stringify(params)} fallback={<PaymentsListSkeleton />}>
        <PaymentsList searchParams={params} showAdminTools compactSummary />
      </Suspense>
    </div>
  );
}
