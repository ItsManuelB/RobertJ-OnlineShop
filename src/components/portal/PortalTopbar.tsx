"use client";

import { Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, ChevronDown, ExternalLink, Plus, Search } from "lucide-react";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ROLE_LABELS, type UserRole } from "@/constants/roles";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import type { SessionUser } from "@/types/common.types";

import { buildBreadcrumb, formatBadgeCount, sumNotificationItems } from "./portal-nav";
import type { PortalNotification, PortalShellConfig, PortalShopCard } from "./portal.types";
import { usePopover } from "./usePopover";

const TONE_DOT: Record<PortalNotification["tone"], string> = {
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

const ICON_BUTTON =
  "relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:h-9 lg:w-9";

export interface PortalTopbarProps {
  config: PortalShellConfig;
  user: SessionUser;
  pathname: string;
  notifications: readonly PortalNotification[];
  shop: PortalShopCard | null;
  onOpenSearch: () => void;
}

/**
 * Breadcrumb, search, "+ New", theme, bell and profile menu. The breadcrumb is
 * plain navigation, not a heading: each page owns its `<h1>`. A page that has
 * none gets a visually hidden one here, so every route still has exactly one.
 */
export function PortalTopbar({ config, user, pathname, notifications, shop, onOpenSearch }: PortalTopbarProps) {
  const { open: bellOpen, setOpen: setBellOpen, rootRef: bellRootRef, triggerRef: bellTriggerRef } = usePopover();
  const {
    open: profileOpen,
    setOpen: setProfileOpen,
    rootRef: profileRootRef,
    triggerRef: profileTriggerRef,
  } = usePopover();
  const fallbackHeading = useRef<HTMLHeadingElement>(null);
  const crumbs = buildBreadcrumb(pathname, config.breadcrumbRoot, config.groups, config.settings, config.homeHref);
  const total = sumNotificationItems(notifications);
  const role = user.role as UserRole;
  const CreateIcon = config.createAction?.icon ?? Plus;
  const pageTitle = crumbs.at(-1)?.label ?? config.portalLabel;

  // Hide the fallback heading when the page rendered its own `<h1>`.
  useEffect(() => {
    if (fallbackHeading.current) {
      fallbackHeading.current.hidden = document.querySelector("main h1") !== null;
    }
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-card px-3 lg:gap-4 lg:px-6">
      <h1 ref={fallbackHeading} className="sr-only">
        {pageTitle}
      </h1>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 lg:flex-none">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? (
                  <li aria-hidden="true" className="text-muted-foreground">
                    ›
                  </li>
                ) : null}
                <li className={cn("min-w-0", !last && index === 0 && "hidden sm:block")}>
                  {last || !crumb.href ? (
                    <span aria-current="page" className="block truncate font-semibold text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="rounded text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-keyshortcuts="Control+K"
        className="ml-2 hidden h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-left text-sm text-muted-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:flex"
      >
        <Search className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{config.searchHint}</span>
        <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] font-semibold">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 lg:gap-1.5">
        <button type="button" onClick={onOpenSearch} className={cn(ICON_BUTTON, "md:hidden")}>
          <Search className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Search</span>
        </button>

        {config.createAction ? (
          <Link
            href={config.createAction.href}
            className="inline-flex h-11 w-11 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:h-9 lg:w-auto lg:px-3"
          >
            <CreateIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">{config.createAction.label}</span>
            <span className="sr-only lg:hidden">{config.createAction.label}</span>
          </Link>
        ) : null}

        <ThemeToggle className="hidden sm:inline-flex" />

        <div ref={bellRootRef} className="relative">
          <button
            ref={bellTriggerRef}
            type="button"
            onClick={() => {
              setBellOpen((value) => !value);
              setProfileOpen(false);
            }}
            aria-expanded={bellOpen}
            aria-haspopup="true"
            aria-controls="portal-bell-panel"
            className={ICON_BUTTON}
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {total > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-bold leading-none text-danger-foreground ring-2 ring-card"
              >
                {formatBadgeCount(total)}
              </span>
            ) : null}
            <span className="sr-only">Notifications{total > 0 ? `, ${total} items waiting` : ""}</span>
          </button>

          {bellOpen ? (
            <div
              id="portal-bell-panel"
              className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Needs your attention</span>
                {total > 0 ? (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                    {total} {total === 1 ? "item" : "items"}
                  </span>
                ) : null}
              </div>
              <div className="max-h-72 divide-y divide-border overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
                ) : (
                  notifications.map((entry) => (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => setBellOpen(false)}
                    >
                      <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", TONE_DOT[entry.tone])} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{entry.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <Link
                href={config.homeHref}
                onClick={() => setBellOpen(false)}
                className="block border-t border-border px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                View all on Dashboard →
              </Link>
            </div>
          ) : null}
        </div>

        <div aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <div ref={profileRootRef} className="relative">
          <button
            ref={profileTriggerRef}
            type="button"
            onClick={() => {
              setProfileOpen((value) => !value);
              setBellOpen(false);
            }}
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-controls="portal-profile-panel"
            className="flex h-11 items-center gap-2.5 rounded-lg pl-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:h-auto lg:py-1.5"
          >
            <Avatar
              src={user.avatarUrl}
              name={user.fullName ?? user.email}
              size={32}
              className="h-8 w-8 border border-primary/30 bg-primary/10 text-xs font-semibold text-primary lg:h-7 lg:w-7"
            />
            <div className="hidden text-left sm:block">
              <p className="max-w-40 truncate text-xs font-semibold leading-tight text-foreground">
                {user.fullName ?? user.email}
              </p>
              <p className="max-w-40 truncate text-[10px] leading-tight text-muted-foreground">
                {shop?.kind === "shop" ? shop.name : ROLE_LABELS[role]}
              </p>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden="true" />
            <span className="sr-only">Account menu</span>
          </button>

          {profileOpen ? (
            <div
              id="portal-profile-panel"
              className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
            >
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-semibold text-foreground">{user.fullName ?? ROLE_LABELS[role]}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                {shop?.kind === "shop" ? (
                  <p className="mt-0.5 truncate text-xs font-semibold text-primary">{shop.name}</p>
                ) : null}
              </div>
              <div className="border-b border-border p-2 sm:hidden">
                <ThemeToggle />
              </div>
              <div className="py-1.5">
                <Link
                  href={config.settings.href}
                  className="block w-full px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => setProfileOpen(false)}
                >
                  {config.settings.label}
                </Link>
                {shop?.kind === "shop" ? (
                  <Link
                    href={shop.publicHref}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => setProfileOpen(false)}
                  >
                    View my shop
                    <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              <SignOutButton
                themeScope={config.themeScope}
                wrapperClassName="border-t border-border py-1.5"
                className="w-full px-4 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 focus-visible:bg-danger/10 focus-visible:outline-none"
              >
                Sign Out
              </SignOutButton>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
