import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Banknote } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { PaymentMethodFilter } from "@/features/payments/components/PaymentMethodFilter";
import { PaymentSearchInput } from "@/features/payments/components/PaymentSearchInput";
import { PaymentStatusFilter } from "@/features/payments/components/PaymentStatusFilter";
import { PaymentsList } from "@/features/payments/components/PaymentsList";
import { getOrderAttentionCounts, getOwnShopId, getPaymentStatusCounts, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Payments — Seller Portal" };

function PaymentsListSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">Loading payment history</span>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      {Array.from({ length: 3 }).map((_, index) => <Skeleton key={`row-${index}`} className="h-20 w-full rounded-2xl" />)}
    </div>
  );
}

interface SellerPaymentsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SellerPaymentsPage({ searchParams }: SellerPaymentsPageProps) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const shopId = await getOwnShopId(user.id);
  // The tab numbers and the COD banner are a nicety — a failed count just leaves them out.
  const [statusCounts, attention] = await Promise.all([
    getPaymentStatusCounts().catch(() => undefined),
    getOrderAttentionCounts(shopId).catch(() => undefined),
  ]);
  const codToCollect = attention?.codAwaitingCollection ?? 0;

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">
          See what has been paid and record cash you collected on delivery.
        </p>
      </div>

      {codToCollect > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3" role="status">
          <Banknote className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="flex-1 text-sm text-foreground">
            <span className="font-semibold">
              {codToCollect} COD payment{codToCollect === 1 ? "" : "s"} ready to record.
            </span>{" "}
            {codToCollect === 1 ? "It has" : "These have"} been shipped or delivered. Mark {codToCollect === 1 ? "it" : "them"} collected once you have the cash.
          </p>
          <Link
            href={`${ROUTES.sellerPayments}?status=pending&paymentMethodType=cod`}
            className={buttonVariants({ variant: "outline", size: "rjSm" })}
          >
            Show only these
          </Link>
        </div>
      ) : null}

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
        <PaymentsList searchParams={params} compactSummary />
      </Suspense>
    </div>
  );
}
