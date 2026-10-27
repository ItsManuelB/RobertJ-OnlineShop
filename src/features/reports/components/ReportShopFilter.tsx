"use client";

import { useId, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ReportShopOption } from "./ReportsFilters";

export interface ReportShopFilterProps {
  shops: ReportShopOption[];
  shopId: string | null;
}

/** Admin shop picker for Reports. Writes `shopId` to the URL (keeping the other filters) so every panel re-reads for that shop. */
export function ReportShopFilter({ shops, shopId }: ReportShopFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const selectId = useId();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("shopId", next);
    else params.delete("shopId");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-muted-foreground">
        Shop
      </label>
      <select
        id={selectId}
        value={shopId ?? ""}
        disabled={isPending}
        onChange={(event) => change(event.target.value)}
        className="h-10 max-w-52 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
      >
        <option value="">All shops</option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.name}
          </option>
        ))}
      </select>
    </div>
  );
}
