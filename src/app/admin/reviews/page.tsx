import { Suspense } from "react";
import type { Metadata } from "next";

import { AdminReviewQueue } from "@/features/reviews/components/AdminReviewQueue";
import { ReviewQueueSkeleton } from "@/features/reviews/components/ShopReviewQueue";

export const metadata: Metadata = { title: "Reviews — Admin Portal" };

interface AdminReviewsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Every review across the shops, with hide / show. The parent `/admin` layout enforces the admin role. */
export default async function AdminReviewsPage({ searchParams }: AdminReviewsPageProps) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          What buyers say across all shops. Hide a review that breaks the rules; it is kept, not deleted.
        </p>
      </div>
      <Suspense key={JSON.stringify(params)} fallback={<ReviewQueueSkeleton />}>
        <AdminReviewQueue tab={first(params.tab)} page={first(params.page)} />
      </Suspense>
    </div>
  );
}
