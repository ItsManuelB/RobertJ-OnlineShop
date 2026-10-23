export const SELLER_ORDER_TABS = [
  { id: "all", label: "All" },
  { id: "confirm", label: "To confirm" },
  { id: "ship", label: "To prepare & ship" },
  { id: "delivered", label: "Delivered" },
] as const;

export type SellerOrderTab = (typeof SELLER_ORDER_TABS)[number]["id"];

export const DEFAULT_SELLER_ORDER_TAB: SellerOrderTab = "all";

/** Coerces the `?ordersTab=` search param, falling back to the default for anything unknown. */
export function parseSellerOrderTab(value: string | string[] | undefined): SellerOrderTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return SELLER_ORDER_TABS.some((tab) => tab.id === raw) ? (raw as SellerOrderTab) : DEFAULT_SELLER_ORDER_TAB;
}
