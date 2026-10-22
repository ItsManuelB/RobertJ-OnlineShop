"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { RJ_CARD } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";
import { ACTIVITY_EVENT_COPY } from "@/features/notifications/constants/notification.constants";
import type { BuyerActivityEvent } from "@/features/notifications/types/notification.types";

const PREVIEW_LIMIT = 5;
const CLOSE_DELAY_MS = 150;
/** `localStorage` key for the "seen up to" timestamp — client-only read state, no DB column (see DECISIONS.md ADR-018: no new table, no triggers). */
const LAST_SEEN_STORAGE_KEY = "roberj.notifications.lastSeenAt";

export interface NotificationBellProps {
  /** Most-recent-first, from `getBuyerActivityFeed()` — empty for guests or when order updates are turned off. */
  events: BuyerActivityEvent[];
}

/**
 * Header notification bell beside the cart icon — mirrors CartPreview's
 * hover/focus popover pattern over the same derived, read-only activity feed
 * `/notifications` already renders. "Unread" is purely a client-side
 * `localStorage` timestamp comparison (no new backend state); opening the
 * popover marks every currently-loaded event as seen.
 */
export function NotificationBell({ events }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  // Starts at 0 so server and first client render match; the real count is
  // computed after mount, once `localStorage` is available.
  const [unreadCount, setUnreadCount] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Same hydration-safety reasoning as LoginForm's window.location read:
    // localStorage is unavailable during SSR, so the real count can only be
    // computed post-mount — the `useState(0)` above is what the server and
    // the client's first render agree on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnreadCount(() => {
      if (events.length === 0) return 0;
      const lastSeenAt = window.localStorage.getItem(LAST_SEEN_STORAGE_KEY);
      return lastSeenAt ? events.filter((event) => event.occurredAt > lastSeenAt).length : events.length;
    });
  }, [events]);

  function markAllSeen() {
    if (events.length === 0) return;
    window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, events[0].occurredAt);
    setUnreadCount(0);
  }

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  function openBell() {
    cancelClose();
    setOpen(true);
    markAllSeen();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  const previewEvents = events.slice(0, PREVIEW_LIMIT);
  const extraCount = events.length - previewEvents.length;
  const showPreview = open && events.length > 0;

  return (
    <div className="relative" onMouseEnter={openBell} onMouseLeave={scheduleClose}>
      <Link
        href={ROUTES.notifications}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-haspopup={events.length > 0 ? "dialog" : undefined}
        aria-expanded={events.length > 0 ? showPreview : undefined}
        onFocus={openBell}
        onBlur={scheduleClose}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-rj-gray-100"
      >
        <Bell className="h-[18px] w-[18px] text-rj-black" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rj-red px-0.5 text-[9px] font-bold text-rj-white"
            style={{ animation: "pop 0.2s ease" }}
          >
            {unreadCount}
          </span>
        ) : null}
      </Link>

      {showPreview ? (
        <div
          role="dialog"
          aria-label="Recent notifications"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={scheduleClose}
          className={cn(
            RJ_CARD,
            "absolute right-0 top-full z-50 mt-2 w-[340px] max-w-[90vw] overflow-hidden p-5 shadow-lg",
          )}
        >
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-rj-gray-500">
              Notifications
            </p>
            <span className="text-[9px] font-semibold text-rj-gray-400">
              {events.length} recent
            </span>
          </div>

          <ul className="mt-2.5 flex flex-col gap-2 divide-y divide-rj-gray-100">
            {previewEvents.map((event, index) => {
              const copy = ACTIVITY_EVENT_COPY[event.eventType];
              return (
                <li key={`${event.orderId}-${event.eventType}-${index}`}>
                  <Link
                    href={ROUTES.orderDetail(event.orderId)}
                    className="flex items-start gap-2.5 rounded-md py-3.5 first:pt-0 last:pb-0 hover:bg-rj-gray-50"
                  >
                    <span className="text-base leading-none" aria-hidden="true">
                      {copy.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium leading-tight text-rj-black">
                        {copy.label(event.orderNumber)}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-rj-gray-500">
                        {formatDateTime(event.occurredAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {extraCount > 0 ? (
            <p className="mt-1 border-t border-rj-gray-100 pt-2 text-center text-[10px] text-rj-gray-500">
              +{extraCount} more notification{extraCount === 1 ? "" : "s"}
            </p>
          ) : null}

          <Link
            href={ROUTES.notifications}
            className={cn(buttonVariants({ variant: "rj", size: "rj" }), "mt-3 w-full py-2 text-xs")}
          >
            View All Notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
