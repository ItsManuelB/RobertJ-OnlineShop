"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils/cn";

import { formatBadgeCount, isNavActive } from "./portal-nav";
import type { PortalBadges, PortalTabItem } from "./portal.types";

export interface PortalTabBarProps {
  tabs: readonly PortalTabItem[];
  homeHref: string;
  pathname: string;
  badges: PortalBadges;
  menuOpen: boolean;
  onOpenMenu: () => void;
}

const TAB =
  "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Phone-only bottom bar: three daily destinations plus "More", which opens the full menu. */
export function PortalTabBar({ tabs, homeHref, pathname, badges, menuOpen, onOpenMenu }: PortalTabBarProps) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-border bg-card px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] lg:hidden"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = !menuOpen && isNavActive(pathname, tab.href, homeHref);
        const badge = badges[tab.href];
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(TAB, active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} aria-hidden="true" />
            <span>{tab.label}</span>
            {badge && badge.count > 0 ? (
              <span
                className={cn(
                  "absolute right-[22%] top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9.5px] font-bold leading-none",
                  badge.urgent ? "bg-danger text-danger-foreground" : "bg-primary text-primary-foreground",
                )}
              >
                <span aria-hidden="true">{formatBadgeCount(badge.count)}</span>
                <span className="sr-only">{badge.count} waiting</span>
              </span>
            ) : null}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        className={cn(TAB, menuOpen ? "text-primary" : "text-muted-foreground hover:text-foreground")}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
