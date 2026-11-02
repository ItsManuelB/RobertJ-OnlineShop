"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

import { useScrollLock } from "@/hooks/useScrollLock";
import { cn } from "@/lib/utils/cn";
import type { SessionUser } from "@/types/common.types";

import { PortalCommandPalette } from "./PortalCommandPalette";
import { PortalSidebar } from "./PortalSidebar";
import { PortalTabBar } from "./PortalTabBar";
import { PortalTopbar } from "./PortalTopbar";
import type { PortalBadges, PortalNotification, PortalShellConfig, PortalShopCard } from "./portal.types";

// --- remembered "collapsed sidebar" choice (per portal, per browser) ---------

const railListeners = new Set<() => void>();

function subscribeRail(callback: () => void) {
  railListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    railListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readRail(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeRail(key: string, collapsed: boolean) {
  try {
    window.localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice just doesn't persist.
  }
  railListeners.forEach((listener) => listener());
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

export interface PortalShellProps {
  config: PortalShellConfig;
  user: SessionUser;
  notifications: readonly PortalNotification[];
  badges: PortalBadges;
  shop: PortalShopCard | null;
  children: React.ReactNode;
}

/**
 * Seller and Admin portal chrome: skip link, grouped sidebar (icon-only on
 * request), phone bottom tab bar with a menu drawer, topbar and the Ctrl K
 * palette. The two portals differ only by the `config` and data they pass in.
 * Never renders the buyer marketplace's SiteHeader/SiteFooter.
 */
export function PortalShell({ config, user, notifications, badges, shop, children }: PortalShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerReturnFocus = useRef<Element | null>(null);

  // The phone drawer is modal: the page behind must not scroll (or drag the sticky bars with it).
  useScrollLock(drawerOpen);

  const railKey = `portal-sidebar-collapsed:${config.themeScope}`;
  const rail = useSyncExternalStore(
    subscribeRail,
    () => readRail(railKey),
    () => false,
  );

  const openDrawer = useCallback(() => {
    drawerReturnFocus.current = document.activeElement;
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    if (drawerReturnFocus.current instanceof HTMLElement) drawerReturnFocus.current.focus();
  }, []);

  // Phone drawer: focus moves in, Escape closes, Tab stays inside.
  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const items = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Ctrl/Cmd K, or "/" outside a text field, opens the palette.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      } else if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div data-theme-scope={config.themeScope} className="flex min-h-screen bg-background">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        ref={drawerRef}
        aria-label={`${config.portalLabel} navigation`}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          rail && "lg:w-16",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <PortalSidebar
          config={config}
          user={user}
          pathname={pathname}
          badges={badges}
          shop={shop}
          rail={rail}
          onToggleRail={() => writeRail(railKey, !rail)}
          onNavigate={() => {
            if (drawerOpen) setDrawerOpen(false);
          }}
          onClose={closeDrawer}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopbar
          config={config}
          user={user}
          pathname={pathname}
          notifications={notifications}
          shop={shop}
          onOpenSearch={() => setPaletteOpen(true)}
        />
        <main id="portal-main" tabIndex={-1} className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] outline-none lg:pb-0">
          {children}
        </main>
      </div>

      <PortalTabBar
        tabs={config.tabs}
        homeHref={config.homeHref}
        pathname={pathname}
        badges={badges}
        menuOpen={drawerOpen}
        onOpenMenu={openDrawer}
      />

      <PortalCommandPalette config={config} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
