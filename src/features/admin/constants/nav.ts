import {
  BarChart3,
  Boxes,
  CreditCard,
  History,
  LayoutGrid,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Tags,
  Users,
} from "lucide-react";

import type { PortalNavGroup, PortalNavItem, PortalShellConfig } from "@/components/portal/portal.types";
import { ROUTES } from "@/constants/routes";

/** Operations first, then catalog upkeep, reports and platform management. */
export const ADMIN_NAV_GROUPS: readonly PortalNavGroup[] = [
  {
    label: "Overview",
    items: [{ href: ROUTES.adminDashboard, label: "Dashboard", icon: LayoutGrid }],
  },
  {
    label: "Operations",
    items: [
      { href: ROUTES.adminOrders, label: "Orders", icon: ShoppingBag },
      { href: ROUTES.adminReturns, label: "Returns & Refunds", icon: RotateCcw },
      { href: ROUTES.adminPayments, label: "Payments", icon: CreditCard },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: ROUTES.adminProducts, label: "Products", icon: Package },
      { href: ROUTES.adminInventory, label: "Inventory", icon: Boxes },
      { href: ROUTES.adminCategories, label: "Categories", icon: Tags },
      { href: ROUTES.adminReviews, label: "Reviews", icon: Star },
    ],
  },
  {
    label: "Insights",
    items: [{ href: ROUTES.adminReports, label: "Reports", icon: BarChart3 }],
  },
  {
    label: "Management",
    items: [
      { href: ROUTES.adminUsers, label: "Users", icon: Users },
      { href: ROUTES.adminShops, label: "Shops", icon: Store },
      { href: ROUTES.adminAuditLog, label: "Audit Log", icon: History },
    ],
  },
];

export const ADMIN_SETTINGS_ITEM: PortalNavItem = {
  href: ROUTES.adminSettings,
  label: "Settings",
  icon: Settings,
};

/** Admin Portal's slice of the shared shell. No "+ New": admins don't create products from the shell. */
export const ADMIN_SHELL_CONFIG: PortalShellConfig = {
  portalLabel: "Admin Portal",
  breadcrumbRoot: "Admin",
  themeScope: "admin",
  homeHref: ROUTES.adminDashboard,
  groups: ADMIN_NAV_GROUPS,
  settings: ADMIN_SETTINGS_ITEM,
  tabs: [
    { href: ROUTES.adminDashboard, label: "Dashboard", icon: LayoutGrid },
    { href: ROUTES.adminOrders, label: "Orders", icon: ShoppingBag },
    { href: ROUTES.adminProducts, label: "Products", icon: Package },
  ],
  createAction: null,
  searchRoutes: { orders: ROUTES.adminOrders, products: ROUTES.adminProducts },
  searchHint: "Search orders, products, pages…",
};
