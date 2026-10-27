// No value imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

export const WISHLIST_SORTS = ["recent", "price_asc", "price_desc"] as const;
export type WishlistSort = (typeof WISHLIST_SORTS)[number];

export const WISHLIST_SORT_LABELS: Record<WishlistSort, string> = {
  recent: "Recently saved",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

export const WISHLIST_SHOWS = ["all", "in_stock", "low_or_out"] as const;
export type WishlistShow = (typeof WISHLIST_SHOWS)[number];

export const WISHLIST_SHOW_LABELS: Record<WishlistShow, string> = {
  all: "All",
  in_stock: "In stock",
  low_or_out: "Low or out",
};

export interface WishlistView {
  sort: WishlistSort;
  show: WishlistShow;
}

interface WishlistItem {
  priceCents: number;
  quantity: number;
}

/** Unknown or missing URL values fall back to the defaults (saved order, everything). */
export function parseWishlistView(sort: string | undefined, show: string | undefined): WishlistView {
  return {
    sort: (WISHLIST_SORTS as readonly string[]).includes(sort ?? "") ? (sort as WishlistSort) : "recent",
    show: (WISHLIST_SHOWS as readonly string[]).includes(show ?? "") ? (show as WishlistShow) : "all",
  };
}

/** "In stock" is above the low-stock line; "Low or out" is at or below it, so the two never overlap. */
function matchesShow(item: WishlistItem, show: WishlistShow, lowStockThreshold: number): boolean {
  if (show === "in_stock") return item.quantity > lowStockThreshold;
  if (show === "low_or_out") return item.quantity <= lowStockThreshold;
  return true;
}

/** How many items each availability chip would show. */
export function countByShow(
  items: readonly WishlistItem[],
  lowStockThreshold: number,
): Record<WishlistShow, number> {
  return {
    all: items.length,
    in_stock: items.filter((item) => matchesShow(item, "in_stock", lowStockThreshold)).length,
    low_or_out: items.filter((item) => matchesShow(item, "low_or_out", lowStockThreshold)).length,
  };
}

/** Filters, then sorts; "recent" keeps the incoming (saved) order. Never mutates the input. */
export function applyWishlistView<T extends WishlistItem>(
  items: readonly T[],
  view: WishlistView,
  lowStockThreshold: number,
): T[] {
  const shown = items.filter((item) => matchesShow(item, view.show, lowStockThreshold));
  if (view.sort === "price_asc") return [...shown].sort((a, b) => a.priceCents - b.priceCents);
  if (view.sort === "price_desc") return [...shown].sort((a, b) => b.priceCents - a.priceCents);
  return shown;
}
