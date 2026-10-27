"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { ROLE_LABELS, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { getInitials } from "@/lib/utils/format";
import type { SessionUser } from "@/types/common.types";

import { formatBadgeCount, isNavActive } from "./portal-nav";
import type { PortalBadges, PortalNavItem, PortalShellConfig, PortalShopCard } from "./portal.types";

function NavLink({
  item,
  active,
  badge,
  rail,
}: {
  item: PortalNavItem;
  active: boolean;
  badge: PortalBadges[string] | undefined;
  rail: boolean;
}) {
  const Icon = item.icon;
  const count = badge?.count ?? 0;
  const label = count > 0 ? `${item.label}, ${count} waiting` : item.label;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? label : undefined}
      title={rail ? label : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent-foreground/60",
        rail && "lg:justify-center lg:px-0",
        active
          ? "bg-sidebar-accent text-sidebar-foreground before:absolute before:-left-3 before:bottom-2 before:top-2 before:w-[3px] before:rounded-r before:bg-sidebar-accent-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-border/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden="true" />
      <span className={cn("truncate", rail && "lg:hidden")}>{item.label}</span>
      {count > 0 ? (
        <>
          <span
            className={cn(
              "ml-auto grid h-5 min-w-5 flex-shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-extrabold leading-none",
              badge?.urgent ? "bg-[#d6404c] text-white" : "bg-sidebar-warning text-[#2b1d00]",
              rail && "lg:hidden",
            )}
          >
            {formatBadgeCount(count)}
          </span>
          {rail ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-2 top-2 hidden h-2 w-2 rounded-full lg:block",
                badge?.urgent ? "bg-[#d6404c]" : "bg-sidebar-warning",
              )}
            />
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function ShopCard({ shop, rail }: { shop: PortalShopCard; rail: boolean }) {
  if (shop.kind === "none") {
    return (
      <div className={cn("mx-3 mt-3 rounded-xl border border-sidebar-border p-3 text-xs", rail && "lg:hidden")}>
        <p className="font-semibold text-sidebar-foreground">No shop linked yet</p>
        <Link href={shop.settingsHref} className="mt-0.5 inline-block font-semibold text-sidebar-accent-foreground underline">
          Check settings
        </Link>
      </div>
    );
  }
  const progress = shop.setup ? Math.round((shop.setup.done / shop.setup.total) * 100) : 100;
  return (
    <div className={cn("mx-3 mt-3 flex flex-col gap-2 rounded-xl border border-sidebar-border p-3", rail && "lg:hidden")}>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">{shop.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-sidebar-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", shop.active ? "bg-success" : "bg-sidebar-warning")}
            />
            {shop.active ? "Active" : "Inactive"}
          </span>
          <span aria-hidden="true">·</span>
          <Link
            href={shop.publicHref}
            className="inline-flex items-center gap-0.5 font-semibold text-sidebar-accent-foreground hover:underline"
          >
            View shop
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </p>
        {shop.active ? null : (
          <p className="mt-1 text-[11px] font-semibold text-sidebar-warning">Customers can&apos;t see this shop.</p>
        )}
      </div>
      {shop.setup ? (
        <Link href={shop.setup.href} className="group flex flex-col gap-1">
          <span className="h-1.5 overflow-hidden rounded-full bg-sidebar-border" aria-hidden="true">
            <span className="block h-full rounded-full bg-sidebar-warning" style={{ width: `${progress}%` }} />
          </span>
          <span className="text-[11px] text-sidebar-muted-foreground">
            Shop profile {shop.setup.done} of {shop.setup.total} ·{" "}
            <span className="font-semibold text-sidebar-warning group-hover:underline">Finish setup</span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}

export interface PortalSidebarProps {
  config: PortalShellConfig;
  user: SessionUser;
  pathname: string;
  badges: PortalBadges;
  shop: PortalShopCard | null;
  /** Icon-only on wide screens. The phone drawer always shows labels. */
  rail: boolean;
  onToggleRail: () => void;
  onNavigate: () => void;
  onClose: () => void;
}

/** Grouped portal menu: compact brand, optional shop card, counts, Settings and the signed-in user pinned at the bottom. */
export function PortalSidebar({
  config,
  user,
  pathname,
  badges,
  shop,
  rail,
  onToggleRail,
  onNavigate,
  onClose,
}: PortalSidebarProps) {
  const role = user.role as UserRole;
  const settingsActive = isNavActive(pathname, config.settings.href, config.homeHref);
  const SettingsIcon = config.settings.icon;
  const RailIcon = rail ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="flex h-full flex-col select-none border-r border-sidebar-border bg-sidebar-background">
      <div
        className={cn(
          "flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-sidebar-border px-4",
          rail && "lg:justify-center lg:px-0",
        )}
      >
        <Link href={ROUTES.home} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent-foreground/60">
          <Image
            src="/brand/logo-v2.png"
            alt="RobertJ Shop — back to homepage"
            width={1254}
            height={1254}
            className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
          />
          <span className={cn("flex min-w-0 flex-col", rail && "lg:hidden")}>
            <span className="text-[15px] font-semibold leading-tight tracking-tight text-sidebar-foreground">RobertJ</span>
            <span className="text-[10px] font-medium leading-tight text-sidebar-muted-foreground">{config.portalLabel}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-sidebar-muted-foreground transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent-foreground/60 lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Close menu</span>
        </button>
      </div>

      {shop ? <ShopCard shop={shop} rail={rail} /> : null}

      <nav
        aria-label={`${config.breadcrumbRoot} menu`}
        className="flex-1 space-y-4 overflow-y-auto px-3 py-4"
        onClick={onNavigate}
      >
        {config.groups.map((group) => (
          <div key={group.label}>
            <p
              className={cn(
                "mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted-foreground",
                rail && "lg:hidden",
              )}
            >
              {group.label}
            </p>
            {rail ? <hr className="mx-2 mb-2 hidden border-sidebar-border lg:block" /> : null}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavActive(pathname, item.href, config.homeHref)}
                  badge={badges[item.href]}
                  rail={rail}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 space-y-1 border-t border-sidebar-border px-3 py-3" onClick={onNavigate}>
        <Link
          href={config.settings.href}
          aria-current={settingsActive ? "page" : undefined}
          aria-label={rail ? config.settings.label : undefined}
          title={rail ? config.settings.label : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent-foreground/60",
            rail && "lg:justify-center lg:px-0",
            settingsActive
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-muted-foreground hover:bg-sidebar-border/50 hover:text-sidebar-foreground",
          )}
        >
          <SettingsIcon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden="true" />
          <span className={cn(rail && "lg:hidden")}>{config.settings.label}</span>
        </Link>
        <div className={cn("flex items-center gap-3 px-3 py-2", rail && "lg:justify-center lg:px-0")}>
          <div
            aria-hidden="true"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-sidebar-accent-foreground/30 bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
          >
            {getInitials(user.fullName ?? user.email)}
          </div>
          <div className={cn("min-w-0 flex-1", rail && "lg:hidden")}>
            <p className="truncate text-xs font-medium leading-tight text-sidebar-foreground">
              {user.fullName ?? user.email}
            </p>
            <p className="truncate text-[10px] leading-tight text-sidebar-muted-foreground">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleRail}
          aria-pressed={rail}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-border/50 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-accent-foreground/60 lg:flex",
            rail && "lg:justify-center lg:px-0",
          )}
        >
          <RailIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className={cn(rail && "lg:hidden")}>Collapse</span>
        </button>
      </div>
    </div>
  );
}
