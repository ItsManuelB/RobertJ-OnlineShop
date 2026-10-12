"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface OrderShopFilterOption {
  id: string;
  name: string;
}

/**
 * Admin-only shop dropdown for the dashboard Orders table (F-12) — sets
 * `shopId`, always clears `page`. Mirrors `OrderMethodFilter`'s exact shape;
 * same pattern as `ReportsFilters`'s own shop picker, just as a standalone
 * control instead of bundled into one filter-bar component.
 */
export function OrderShopFilter({ shops }: { shops: OrderShopFilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get("shopId") ?? "";

  function updateParams(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("shopId", value);
    else params.delete("shopId");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (shops.length === 0) return null;

  return (
    <select
      value={active}
      onChange={(event) => updateParams(event.target.value)}
      aria-label="Filter by shop"
      className="h-9 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <option value="">All shops</option>
      {shops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.name}
        </option>
      ))}
    </select>
  );
}
