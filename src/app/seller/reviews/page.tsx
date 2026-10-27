import { Suspense } from "react";
import type { Metadata } from "next";

import { ReviewQueueSkeleton, ShopReviewQueue } from "@/features/reviews/components/ShopReviewQueue";

export const metadata: Metadata = { title: "Reviews — Seller Portal" };

interface SellerReviewsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** What buyers say about the shop's products, with replies. Authorization: `src/app/seller/layout.tsx` (sellers only); RLS and `reply_to_review` scope it to the shop. */
export default async function SellerReviewsPage({ searchParams }: SellerReviewsPageProps) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          What buyers say about your products. Answer low ratings first; every buyer sees your reply.
        </p>
      </div>
      <Suspense key={JSON.stringify(params)} fallback={<ReviewQueueSkeleton />}>
        <ShopReviewQueue tab={first(params.tab)} page={first(params.page)} />
      </Suspense>
    </div>
  );
}
