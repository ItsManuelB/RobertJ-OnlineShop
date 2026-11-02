import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { ReturnQueue } from "@/features/returns/components/ReturnQueue";

export const metadata: Metadata = { title: "Returns & Refunds — Admin Portal" };

interface AdminReturnsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** First value of a possibly-repeated search param. */
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ReturnQueueSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <span className="sr-only">Loading return requests</span>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-40 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * Decides refunds on requests a seller has answered (or never answered), and
 * records COD payouts. Tabs (`?tab=`) default to "Needs my decision" and the
 * list is paginated (`?page=`). Authorization is enforced once by
 * `src/app/admin/layout.tsx` (`requireRole(ADMIN_ONLY_ROLES)`).
 */
export default async function AdminReturnsPage({ searchParams }: AdminReturnsPageProps) {
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Returns &amp; Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Decide refunds, record payouts and step in when a seller does not reply.
        </p>
      </div>

      {/* Keyed so switching tab/page restarts the suspense boundary. */}
      <Suspense key={JSON.stringify(params)} fallback={<ReturnQueueSkeleton />}>
        <ReturnQueue viewer="admin" tab={first(params.tab)} page={first(params.page)} />
      </Suspense>
    </div>
  );
}
