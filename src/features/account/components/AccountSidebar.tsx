"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Heart,
  KeyRound,
  LayoutGrid,
  MapPin,
  Package,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import type { SessionUser } from "@/types/common.types";

const ACCOUNT_NAV = [
  { href: ROUTES.account, label: "Overview", icon: LayoutGrid },
  { href: ROUTES.orders, label: "Orders", icon: Package },
  { href: ROUTES.wishlist, label: "Wishlist", icon: Heart },
  { href: ROUTES.addresses, label: "Addresses", icon: MapPin },
  { href: ROUTES.notifications, label: "Notifications", icon: Bell },
  { href: ROUTES.profile, label: "Profile", icon: UserRound },
  { href: ROUTES.changePassword, label: "Change Password", icon: KeyRound },
  { href: ROUTES.privacy, label: "Privacy & Settings", icon: ShieldCheck },
] as const;

/**
 * Account navigation + identity. Vertical column on desktop (sticky), a
 * horizontal scroll row of pill chips on mobile.
 */
export function AccountSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-2xl border border-rj-gray-100 bg-rj-gray-50 p-4">
        <Avatar
          src={user.avatarUrl}
          name={user.fullName ?? user.email}
          size={44}
          className="h-11 w-11 bg-rj-black text-[13px] text-rj-white"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-rj-black">
            {user.fullName ?? "My account"}
          </p>
          <p className="truncate text-xs text-rj-gray-600">{user.email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="hidden px-1 text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500 lg:block">
          My Account
        </p>

        <nav
          aria-label="My Account"
          className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {ACCOUNT_NAV.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || (href !== ROUTES.account && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 lg:rounded-xl",
                  isActive
                    ? "bg-rj-black text-rj-white"
                    : "text-rj-gray-600 hover:bg-rj-gray-100 hover:text-rj-black",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <SignOutButton
        wrapperClassName="mt-auto"
        className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-rj-red-dark transition-colors hover:bg-rj-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
      >
        Sign out
      </SignOutButton>
    </aside>
  );
}
