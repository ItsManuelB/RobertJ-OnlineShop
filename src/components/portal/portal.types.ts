import type { LucideIcon } from "lucide-react";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface PortalNavGroup {
  label: string;
  items: readonly PortalNavItem[];
}

/** Count shown on a menu item. `urgent` is reserved for items that are late, so red keeps its meaning. */
export interface PortalBadge {
  count: number;
  urgent?: boolean;
}

/** Badges keyed by the nav item's `href`. */
export type PortalBadges = Readonly<Record<string, PortalBadge>>;

export interface PortalNotification {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "warning" | "danger" | "info";
  /** Items this entry stands for; counts as 1 when omitted. The bell shows the sum. */
  count?: number;
}

/** The shop the signed-in seller manages. Admins have no shop card. */
export type PortalShopCard =
  | {
      kind: "shop";
      name: string;
      active: boolean;
      publicHref: string;
      /** Profile checklist progress; `null` once every step is done. */
      setup: { done: number; total: number; href: string } | null;
    }
  | { kind: "none"; settingsHref: string };

export interface PortalTabItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface PortalAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Everything that differs between the Seller and Admin portals. */
export interface PortalShellConfig {
  /** Shown under the logo and in the breadcrumb root, e.g. "Seller Portal" / "Seller". */
  portalLabel: string;
  breadcrumbRoot: string;
  themeScope: "admin" | "seller";
  /** The dashboard route: active only on an exact match, and the target of "View all". */
  homeHref: string;
  groups: readonly PortalNavGroup[];
  /** Pinned at the bottom of the sidebar. */
  settings: PortalNavItem;
  /** The three tabs before "More" on a phone. */
  tabs: readonly PortalTabItem[];
  /** Optional global "+ New" shortcut. */
  createAction: PortalAction | null;
  /** List pages the command palette can search. */
  searchRoutes: { orders: string; products: string };
  /** Placeholder copy for the search field. */
  searchHint: string;
}
