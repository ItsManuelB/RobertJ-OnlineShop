import type { StockStatus } from "@/features/inventory/types/inventory.types";

export const SELLER_STOCK_FILTERS = [
  { id: "all", label: "All" },
  { id: "out_of_stock", label: "Out of stock" },
  { id: "low_stock", label: "Running low" },
] as const;

export type SellerStockFilter = (typeof SELLER_STOCK_FILTERS)[number]["id"] & ("all" | StockStatus);

/** Coerces the `?stockFilter=` search param, falling back to "all" for anything unknown. */
export function parseSellerStockFilter(value: string | string[] | undefined): SellerStockFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return SELLER_STOCK_FILTERS.some((item) => item.id === raw) ? (raw as SellerStockFilter) : "all";
}
