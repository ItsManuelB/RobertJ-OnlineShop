"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";

import { ROLE_LABELS, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { getSellerPageMeta } from "@/features/seller/constants/nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils/cn";
import { getInitials } from "@/lib/utils/format";
import type { SessionUser } from "@/types/common.types";

export interface SellerNotification {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "warning" | "danger" | "info";
}

const TONE_DOT: Record<SellerNotification["tone"], string> = {
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export interface SellerTopbarProps {
  user: SessionUser;
  pathname: string;
  notifications: readonly SellerNotification[];
  onMenuClick: () => void;
}

/** Topbar for the Seller Portal — structural twin of AdminTopbar, driven entirely by semantic tokens. */
export function SellerTopbar({ user, pathname, notifications, onMenuClick }: SellerTopbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { title, subtitle } = getSellerPageMeta(pathname);
  const initials = getInitials(user.fullName ?? user.email);
  const role = user.role as UserRole;

  return (
    <header
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setShowNotifications(false);
          setShowProfile(false);
        }
      }}
      className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-4 border-b border-border bg-card px-4 lg:px-6"
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Open sidebar</span>
      </button>

      <div className="hidden flex-shrink-0 lg:block">
        <h1 className="text-base font-semibold leading-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{subtitle}</p> : null}
      </div>
      <h1 className="flex-1 text-base font-semibold text-foreground lg:hidden">{title}</h1>

      <form
        action={ROUTES.sellerOrders}
        role="search"
        className="ml-4 hidden max-w-md flex-1 md:flex"
      >
        <div className="relative w-full">
          <label htmlFor="seller-order-search" className="sr-only">
            Search orders by order number
          </label>
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="seller-order-search"
            type="search"
            name="search"
            maxLength={40}
            placeholder="Search orders by number…"
            className="w-full rounded-lg border border-border bg-muted py-2 pl-9 pr-4 text-sm text-foreground placeholder-muted-foreground transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle className="hidden sm:inline-flex" />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNotifications((v) => !v);
              setShowProfile(false);
            }}
            aria-expanded={showNotifications}
            className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {notifications.length > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-card" />
            )}
            <span className="sr-only">Notifications</span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {notifications.length > 0 && (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                    {notifications.length} new
                  </span>
                )}
              </div>
              <div className="max-h-72 divide-y divide-border overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    You&apos;re all caught up.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted"
                      onClick={() => setShowNotifications(false)}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", TONE_DOT[n.tone])} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.description}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mx-1 h-6 w-px bg-border" />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowProfile((v) => !v);
              setShowNotifications(false);
            }}
            aria-expanded={showProfile}
            className="flex items-center gap-2.5 rounded-lg py-1.5 pl-1 pr-2 transition-colors hover:bg-muted"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-tight text-foreground">
                {user.fullName ?? user.email}
              </p>
              <p className="text-[10px] leading-tight text-muted-foreground">{ROLE_LABELS[role]}</p>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden="true" />
          </button>

          {showProfile && (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">{user.fullName ?? "Seller"}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <div className="border-b border-border p-2 sm:hidden">
                <ThemeToggle />
              </div>
              <div className="py-1.5">
                <Link
                  href={ROUTES.sellerSettings}
                  className="block w-full px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => setShowProfile(false)}
                >
                  Profile Settings
                </Link>
              </div>
              <SignOutButton
                themeScope="seller"
                wrapperClassName="border-t border-border py-1.5"
                className="w-full px-4 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
              >
                Sign Out
              </SignOutButton>
            </div>
          )}
        </div>
      </div>

      {(showNotifications || showProfile) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowNotifications(false);
            setShowProfile(false);
          }}
        />
      )}
    </header>
  );
}
