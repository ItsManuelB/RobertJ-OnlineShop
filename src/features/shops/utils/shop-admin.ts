import type { ShopWithMember } from "../types/shop.types";

// Type-only imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

export const SHOP_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type ShopStatusFilter = (typeof SHOP_STATUS_FILTERS)[number];

export const SHOP_STATUS_FILTER_LABELS: Record<ShopStatusFilter, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
};

export interface ShopSummary {
  total: number;
  active: number;
  inactive: number;
  /** Names of shops with no seller assigned. */
  unassigned: string[];
}

export function summarizeShops(shops: readonly ShopWithMember[]): ShopSummary {
  const active = shops.filter((shop) => shop.active).length;
  return {
    total: shops.length,
    active,
    inactive: shops.length - active,
    unassigned: shops.filter((shop) => shop.members.length === 0).map((shop) => shop.name),
  };
}

/** Case-insensitive match on shop name, slug or a member's name, then the active / inactive chip. */
export function filterShops(
  shops: readonly ShopWithMember[],
  search: string,
  status: ShopStatusFilter,
): ShopWithMember[] {
  const term = search.trim().toLowerCase();
  return shops.filter((shop) => {
    if (status === "active" && !shop.active) return false;
    if (status === "inactive" && shop.active) return false;
    if (!term) return true;
    return (
      shop.name.toLowerCase().includes(term) ||
      shop.slug.toLowerCase().includes(term) ||
      shop.members.some((member) => member.name.toLowerCase().includes(term))
    );
  });
}
