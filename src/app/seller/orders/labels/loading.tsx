import { Skeleton } from "@/components/ui/skeleton";

export default function SellerOrderLabelsLoading() {
  return (
    <div className="flex flex-col items-center gap-6 p-5 lg:p-7" role="status" aria-live="polite">
      <div className="flex w-full max-w-[420px] items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <Skeleton className="h-[420px] w-full max-w-[420px] rounded-lg" />
    </div>
  );
}
