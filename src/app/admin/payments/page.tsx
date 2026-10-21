import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { PaymentMethodFilter } from "@/features/payments/components/PaymentMethodFilter";
import { PaymentSearchInput } from "@/features/payments/components/PaymentSearchInput";
import { PaymentsList } from "@/features/payments/components/PaymentsList";
import { PaymentStatusFilter } from "@/features/payments/components/PaymentStatusFilter";

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

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <Suspense fallback={null}>
            <PaymentSearchInput />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <PaymentMethodFilter />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <PaymentStatusFilter />
      </Suspense>

      <Suspense key={JSON.stringify(params)} fallback={<PaymentsListSkeleton />}>
        <PaymentsList searchParams={params} showAdminTools />
      </Suspense>
    </div>
  );
}
