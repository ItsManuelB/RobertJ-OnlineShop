import {
  BarChart3,
  Boxes,
  CreditCard,
  LayoutGrid,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Store,
  Undo2,
} from "lucide-react";

import type { PortalNavGroup, PortalNavItem, PortalShellConfig } from "@/components/portal/portal.types";
import { ROUTES } from "@/constants/routes";

/** Grouped by how a seller works: daily orders first, catalog upkeep next, reports last. */
export const SELLER_NAV_GROUPS: readonly PortalNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: ROUTES.sellerDashboard, label: "Dashboard", icon: LayoutGrid }],
  },
  {
    label: "Sell",
    items: [
      { href: ROUTES.sellerOrders, label: "Orders", icon: ShoppingBag },
      { href: ROUTES.sellerReturns, label: "Returns", icon: Undo2 },
      { href: ROUTES.sellerPayments, label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: ROUTES.sellerProducts, label: "Products", icon: Package },
      { href: ROUTES.sellerInventory, label: "Inventory", icon: Boxes },
      { href: ROUTES.sellerShop, label: "My Shop", icon: Store },
    ],
  },
  {
    label: "Insights",
    items: [{ href: ROUTES.sellerReports, label: "Reports", icon: BarChart3 }],
  },
];

export const SELLER_SETTINGS_ITEM: PortalNavItem = {
  href: ROUTES.sellerSettings,
  label: "Settings",
  icon: Settings,
};

/** Seller Portal's slice of the shared shell. */
export const SELLER_SHELL_CONFIG: PortalShellConfig = {
  portalLabel: "Seller Portal",
  breadcrumbRoot: "Seller",
  themeScope: "seller",
  homeHref: ROUTES.sellerDashboard,
  groups: SELLER_NAV_GROUPS,
  settings: SELLER_SETTINGS_ITEM,
  tabs: [
    { href: ROUTES.sellerDashboard, label: "Dashboard", icon: LayoutGrid },
    { href: ROUTES.sellerOrders, label: "Orders", icon: ShoppingBag },
    { href: ROUTES.sellerProducts, label: "Products", icon: Package },
  ],
  createAction: { label: "Add product", href: ROUTES.sellerProductNew, icon: Plus },
  searchRoutes: { orders: ROUTES.sellerOrders, products: ROUTES.sellerProducts },
  searchHint: "Search orders, products, pages…",
};
