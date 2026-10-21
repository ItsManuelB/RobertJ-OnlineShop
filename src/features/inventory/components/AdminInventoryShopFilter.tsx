"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface AdminInventoryShopOption {
  id: string;
  name: string;
}

/** Admin-only shop dropdown; keeps other filters and clears pagination on change. */
export function AdminInventoryShopFilter({ shops }: { shops: AdminInventoryShopOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("shopId") ?? "";

  function updateShop(shopId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (shopId) params.set("shopId", shopId);
    else params.delete("shopId");
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  if (shops.length === 0) return null;

  return (
    <select
      value={active}
      onChange={(event) => updateShop(event.target.value)}
      aria-label="Filter inventory by shop"
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
