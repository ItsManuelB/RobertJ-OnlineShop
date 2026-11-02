import type { PortalNavGroup, PortalNavItem, PortalNotification } from "./portal.types";

/** Active on an exact match, or on a deeper route (an order's page keeps Orders lit). The home route matches exactly only. */
export function isNavActive(pathname: string, href: string, homeHref: string): boolean {
  if (pathname === href) return true;
  return href !== homeHref && pathname.startsWith(`${href}/`);
}

/** "99+" above 99 so a badge never outgrows its pill. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Total items the bell stands for: the sum of each entry's `count` (1 when omitted). */
export function sumNotificationItems(notifications: readonly Pick<PortalNotification, "count">[]): number {
  return notifications.reduce((total, entry) => total + (entry.count ?? 1), 0);
}

export interface PortalCrumb {
  label: string;
  /** Absent on the current page. */
  href?: string;
}

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f-]{20,}|\d+)$/i;

function labelForSegment(segment: string): string {
  if (ID_SEGMENT.test(segment)) return "Details";
  const words = decodeURIComponent(segment).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Breadcrumb for the current route: portal root, the section it belongs to
 * (a link when the page is deeper), then the last path segment. Built from the
 * nav so it can never name a page the menu doesn't know.
 */
export function buildBreadcrumb(
  pathname: string,
  rootLabel: string,
  groups: readonly PortalNavGroup[],
  settings: PortalNavItem,
  homeHref: string,
): PortalCrumb[] {
  const items = [...groups.flatMap((group) => group.items), settings];
  const section = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const crumbs: PortalCrumb[] = [{ label: rootLabel, href: homeHref }];
  if (!section) return crumbs;
  if (pathname === section.href) {
    crumbs.push({ label: section.label });
    return crumbs;
  }
  crumbs.push({ label: section.label, href: section.href });
  const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
  crumbs.push({ label: labelForSegment(last) });
  return crumbs;
}

/** Items matching the palette's query by label, case-insensitively. */
export function filterNavItems(items: readonly PortalNavItem[], query: string): PortalNavItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => item.label.toLowerCase().includes(needle));
}
