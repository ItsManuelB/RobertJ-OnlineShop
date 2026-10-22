import { Skeleton } from "@/components/ui/skeleton";
import { PAGINATION } from "@/constants/pagination";

export function ProductGridSkeleton({
  count = PAGINATION.catalogPageSize,
}: {
  count?: number;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-5 md:grid-cols-3 md:gap-6 lg:grid-cols-4"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading products</span>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="aspect-[3/4] w-full rounded-xl bg-rj-gray-100" />
      ))}
    </div>
  );
}
