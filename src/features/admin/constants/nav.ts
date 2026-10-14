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
  Store,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ROUTES } from "@/constants/routes";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  label: string;
  items: readonly AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    label: "Main",
    items: [
      { href: ROUTES.adminDashboard, label: "Dashboard", icon: LayoutGrid },
      { href: ROUTES.adminProducts, label: "Products", icon: Package },
      { href: ROUTES.adminInventory, label: "Inventory", icon: Boxes },
      { href: ROUTES.adminOrders, label: "Orders", icon: ShoppingBag },
      { href: ROUTES.adminPayments, label: "Payments", icon: CreditCard },
      { href: ROUTES.adminReturns, label: "Returns & Refunds", icon: RotateCcw },
    ],
  },
  {
    label: "Analytics",
    items: [{ href: ROUTES.adminReports, label: "Reports", icon: BarChart3 }],
  },
  {
    label: "Management",
    items: [
      { href: ROUTES.adminUsers, label: "Users", icon: Users },
      { href: ROUTES.adminShops, label: "Shops", icon: Store },
      { href: ROUTES.adminCategories, label: "Categories", icon: Tags },
      { href: ROUTES.adminAuditLog, label: "Audit Log", icon: History },
    ],
  },
  {
    label: "System",
    items: [{ href: ROUTES.adminSettings, label: "Settings", icon: Settings }],
  },
] as const;

/** Page title/subtitle per admin route, keyed by the exact `ROUTES.admin*` path — mirrors the Figma Topbar's section maps. */
export const ADMIN_PAGE_META: Record<string, { title: string; subtitle: string }> = {
  [ROUTES.adminDashboard]: { title: "Dashboard", subtitle: "Overview of your marketplace performance" },
  [ROUTES.adminProducts]: { title: "Products", subtitle: "Manage your product catalog" },
  [ROUTES.adminInventory]: { title: "Inventory", subtitle: "Track stock levels and warehouse data" },
  [ROUTES.adminOrders]: { title: "Orders", subtitle: "View and manage customer orders" },
  [ROUTES.adminPayments]: { title: "Payments", subtitle: "Monitor transactions and payouts" },
  [ROUTES.adminReturns]: { title: "Returns & Refunds", subtitle: "Handle return and refund requests" },
  [ROUTES.adminReports]: { title: "Reports", subtitle: "Analytics and performance reports" },
  [ROUTES.adminUsers]: { title: "Users", subtitle: "Manage buyers and sellers" },
  [ROUTES.adminShops]: { title: "Shops", subtitle: "Review and manage marketplace shops" },
  [ROUTES.adminCategories]: {
    title: "Categories",
    subtitle: "Manage categories and their specification/variant rules",
  },
  [ROUTES.adminAuditLog]: { title: "Audit Log", subtitle: "Track admin actions and system events" },
  [ROUTES.adminSettings]: { title: "Settings", subtitle: "Configure platform settings" },
};

const DEFAULT_PAGE_META = { title: "Admin Portal", subtitle: "" };

/** Falls back to the closest matching prefix (e.g. `/admin/orders/123` → Orders) since detail routes aren't listed individually. */
export function getAdminPageMeta(pathname: string): { title: string; subtitle: string } {
  if (ADMIN_PAGE_META[pathname]) return ADMIN_PAGE_META[pathname];
  const match = Object.keys(ADMIN_PAGE_META)
    .filter((route) => pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ADMIN_PAGE_META[match] : DEFAULT_PAGE_META;
}
