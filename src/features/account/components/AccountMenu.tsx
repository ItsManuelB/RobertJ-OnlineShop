"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RJ_CARD } from "@/components/ui/card";
import { USER_ROLES, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { canViewDashboard } from "@/lib/auth/permissions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import type { SessionUser } from "@/types/common.types";

const BASE_MENU_ITEMS = [
  { href: ROUTES.account, label: "My Account" },
  { href: ROUTES.orders, label: "Orders" },
] as const;

/**
 * Buyers get the shopping menu (My Account, Orders). Seller/Admin are not
 * buyers — their dropdown is ONLY their dashboard (+ the shared Sign out
 * below); the buyer-specific My Account / Orders entries are omitted so the
 * menu never implies buyer functionality they can't use. Each has a dedicated
 * portal, not a shared one.
 */
function getMenuItems(role: UserRole) {
  if (!canViewDashboard(role)) return BASE_MENU_ITEMS;
  const dashboardHref = role === USER_ROLES.admin ? ROUTES.adminDashboard : ROUTES.sellerDashboard;
  return [{ href: dashboardHref, label: "Dashboard" }];
}

/**
 * Signed-in user popover for the shared site header (shop chrome). Closes on
 * outside click and Escape; keyboard-operable with `aria-expanded`/`role="menu"`.
 */
export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuItems = getMenuItems(user.role as UserRole);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex h-9 items-center gap-0.5 rounded-full px-1 transition-colors hover:bg-rj-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
      >
        <Avatar
          src={user.avatarUrl}
          name={user.fullName ?? user.email}
          size={28}
          className="h-7 w-7 bg-rj-black text-[11px] text-rj-white"
        />
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-rj-gray-600 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className={cn(RJ_CARD, "absolute right-0 top-full z-50 mt-2 w-56 p-1.5 shadow-lg")}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-rj-black">
              {user.fullName ?? "My account"}
            </p>
            <p className="truncate text-xs text-rj-gray-600">{user.email}</p>
          </div>
          <div className="mt-1">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm text-rj-black transition-colors hover:bg-rj-gray-100"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <SignOutButton
            wrapperClassName="mt-1 border-t border-rj-gray-100 pt-1.5"
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-rj-red-dark transition-colors hover:bg-rj-gray-100"
          >
            Sign out
          </SignOutButton>
        </div>
      ) : null}
    </div>
  );
}
