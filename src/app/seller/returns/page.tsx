import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { ReturnQueue } from "@/features/returns/components/ReturnQueue";

export const metadata: Metadata = { title: "Returns & Refunds — Seller Portal" };

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
 * Fulfillment/returns audit finding B1: previously, a seller had no
 * dedicated place to see return requests across their shop — only the
 * individual order detail page, which they had no reason to open unless
 * they already knew a request existed. Mirrors the admin queue, but scoped
 * to the seller's own shop by RLS and without the admin-only decide step.
 * Authorization is enforced once by `src/app/seller/layout.tsx`
 * (`requireRole([USER_ROLES.seller])`).
 */
export default function SellerReturnsPage() {
  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <Suspense fallback={<ReturnQueueSkeleton />}>
        <ReturnQueue viewer="seller" />
      </Suspense>
    </div>
  );
}
