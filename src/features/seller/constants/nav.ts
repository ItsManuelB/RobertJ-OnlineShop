import { BarChart3, Boxes, CreditCard, LayoutGrid, Package, ShoppingBag, Store, type LucideIcon } from "lucide-react";

import { ROUTES } from "@/constants/routes";

export interface SellerNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface SellerNavGroup {
  label: string;
  items: readonly SellerNavItem[];
}

/** Mirrors ADMIN_NAV_GROUPS's shape — Main + Analytics only, no Management/System (no Users/Shops/Audit Log/Settings for sellers). */
export const SELLER_NAV_GROUPS: readonly SellerNavGroup[] = [
  {
    label: "Main",
    items: [
      { href: ROUTES.sellerDashboard, label: "Dashboard", icon: LayoutGrid },
      { href: ROUTES.sellerShop, label: "My Shop", icon: Store },
      { href: ROUTES.sellerProducts, label: "Products", icon: Package },
      { href: ROUTES.sellerInventory, label: "Inventory", icon: Boxes },
      { href: ROUTES.sellerOrders, label: "Orders", icon: ShoppingBag },
      { href: ROUTES.sellerPayments, label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: ROUTES.sellerReports, label: "Reports", icon: BarChart3 }],
  },
] as const;

/** Page title/subtitle per seller route, keyed by the exact `ROUTES.seller*` path — mirrors `getAdminPageMeta`. */
export const SELLER_PAGE_META: Record<string, { title: string; subtitle: string }> = {
  [ROUTES.sellerDashboard]: { title: "Dashboard", subtitle: "Overview of your shop's performance" },
  [ROUTES.sellerShop]: { title: "My Shop", subtitle: "Manage your shop's public branding" },
  [ROUTES.sellerSettings]: { title: "Settings", subtitle: "Manage your account and sign-in" },
  [ROUTES.sellerProducts]: { title: "Products", subtitle: "Manage your product catalog" },
  [ROUTES.sellerInventory]: { title: "Inventory", subtitle: "Track your shop's stock levels" },
  [ROUTES.sellerOrders]: { title: "Orders", subtitle: "Fulfil and track your shop's orders" },
  [ROUTES.sellerPayments]: { title: "Payments", subtitle: "Monitor your shop's transactions" },
  [ROUTES.sellerReports]: { title: "Reports", subtitle: "Analytics and performance for your shop" },
};

const DEFAULT_PAGE_META = { title: "Seller Portal", subtitle: "" };

/** Falls back to the closest matching prefix (e.g. `/seller/orders/123` → Orders) since detail routes aren't listed individually. */
export function getSellerPageMeta(pathname: string): { title: string; subtitle: string } {
  if (SELLER_PAGE_META[pathname]) return SELLER_PAGE_META[pathname];
  const match = Object.keys(SELLER_PAGE_META)
    .filter((route) => pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SELLER_PAGE_META[match] : DEFAULT_PAGE_META;
}
