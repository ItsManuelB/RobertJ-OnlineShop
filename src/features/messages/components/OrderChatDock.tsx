"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils/cn";

// --- remembered "chat dock open" choice (per order + side, per browser) ------
// Same external-store shape PortalShell uses for its sidebar rail: a module
// listener set + localStorage, read through useSyncExternalStore so there's no
// setState-in-effect and SSR hydrates against a stable default (minimized).
// Purely client-side — never touches Supabase.

const dockListeners = new Set<() => void>();

function subscribeDock(callback: () => void) {
  dockListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    dockListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readDockOpen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDockOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the choice just doesn't persist.
  }
  dockListeners.forEach((listener) => listener());
}

export interface OrderChatDockProps {
  /** Renders through the Admin/Seller portal tokens; omit for the buyer view. */
  themed?: boolean;
  /** Count on the launcher pill + header (message count — there's no unread model yet). */
  badgeCount: number;
  /** Persisted open/minimized key, per order + side (see `chatDockMinimizedStorageKey`). */
  storageKey: string;
  /** Launcher + header label — defaults to "Chat" (Shopee-style). */
  title?: string;
  /** Row under the header: order / counterpart context. */
  contextCard?: ReactNode;
  /** Conversation body (`MessageThreadBody`). Stays mounted while minimized so the draft survives. */
  children: ReactNode;
}

/**
 * Shopee-style floating chat dock shared by the buyer (`ContactSellerDock`) and
 * the seller/admin (`OrderMessageThread`): a bottom-right launcher pill that
 * expands into a panel with a "Chat (n)" header and a chevron that minimizes it
 * back to the pill. The panel is never unmounted — only hidden — so an unsent
 * draft and the scroll position survive a minimize/expand. The open/minimized
 * choice persists per order + side across reloads, independently per browser.
 *
 * On the seller/admin portal the pill clears the phone bottom tab bar
 * (`bottom-20 lg:bottom-4`); the buyer marketplace has no such bar.
 */
export function OrderChatDock({
  themed = false,
  badgeCount,
  storageKey,
  title = "Chat",
  contextCard,
  children,
}: OrderChatDockProps) {
  const titleId = useId();
  const panelId = useId();
  const minimizeRef = useRef<HTMLButtonElement>(null);

  const open = useSyncExternalStore(
    subscribeDock,
    () => readDockOpen(storageKey),
    () => false,
  );

  // Move focus into the panel when it opens, and let Escape minimize it. These
  // are DOM side effects (not setState), so they're clear of the
  // no-setState-in-effect rule.
  useEffect(() => {
    if (!open) return;
    minimizeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") writeDockOpen(storageKey, false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, storageKey]);

  const bottom = themed ? "bottom-20 lg:bottom-4" : "bottom-4";
  const badge = badgeCount > 0 ? (badgeCount > 99 ? "99+" : String(badgeCount)) : null;

  return (
    <>
      {/* Launcher pill — shown while minimized. */}
      <button
        type="button"
        onClick={() => writeDockOpen(storageKey, true)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "fixed right-4 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          bottom,
          open && "hidden",
          themed
            ? "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40"
            : "bg-rj-red text-rj-white hover:bg-rj-red-dark focus-visible:ring-rj-red/40",
        )}
      >
        <MessageSquare className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{title}</span>
        {badge ? (
          <span
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold",
              themed ? "bg-primary-foreground text-primary" : "bg-rj-white text-rj-red",
            )}
          >
            {badge}
          </span>
        ) : null}
      </button>

      {/* Panel — always mounted; hidden (not unmounted) while minimized so the
          composer draft and scroll position persist. */}
      <div
        id={panelId}
        role="dialog"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={cn(
          "fixed right-4 z-40 flex h-[32rem] max-h-[calc(100vh-2rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border shadow-xl transition-all duration-200 ease-out motion-reduce:transition-none",
          bottom,
          themed ? "border-border bg-card" : "border-rj-gray-200 bg-rj-white",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2 border-b px-4 py-3",
            themed ? "border-border" : "border-rj-gray-100",
          )}
        >
          <p
            id={titleId}
            className={cn("flex items-center gap-1.5 text-sm font-bold", themed ? "text-primary" : "text-rj-red")}
          >
            <span>{title}</span>
            {badge ? (
              <span className={cn("text-xs font-semibold", themed ? "text-muted-foreground" : "text-rj-gray-500")}>
                ({badge})
              </span>
            ) : null}
          </p>
          <button
            ref={minimizeRef}
            type="button"
            onClick={() => writeDockOpen(storageKey, false)}
            aria-label="Minimize chat"
            className={cn(
              "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2",
              themed
                ? "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary/30"
                : "text-rj-gray-500 hover:bg-rj-gray-100 hover:text-rj-black focus-visible:ring-rj-red/30",
            )}
          >
            <ChevronDown className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {contextCard}

        {children}
      </div>
    </>
  );
}
