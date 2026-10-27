"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { SignOutButton } from "@/features/auth/components/SignOutButton";
import { getVisibleDashboardNav } from "@/features/dashboard/constants/nav";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import type { SessionUser } from "@/types/common.types";

/**
 * Dashboard navigation + identity. Vertical column on desktop (sticky), a
 * horizontal scroll row of pill chips on mobile — same mechanism as
 * `AccountSidebar`, copied rather than shared per that module's own
 * "never an admin surface" boundary.
 */
export function DashboardSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const role = user.role as UserRole;
  const items = getVisibleDashboardNav(role);

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
            {user.fullName ?? "Dashboard"}
          </p>
          <p className="truncate text-xs text-rj-gray-600">{ROLE_LABELS[role]}</p>
        </div>
      </div>

      <nav
        aria-label="Dashboard"
        className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {items.map(({ href, label, icon: Icon, status }) => {
          const isActive =
            pathname === href || (href !== ROUTES.dashboard && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30 lg:rounded-xl lg:justify-between",
                isActive
                  ? "bg-rj-black text-rj-white"
                  : "text-rj-gray-600 hover:bg-rj-gray-100 hover:text-rj-black",
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </span>
              {status === "comingSoon" ? (
                <Badge
                  tone="neutral"
                  className={cn("hidden lg:inline-flex", isActive && "bg-rj-white/15 text-rj-white")}
                >
                  Soon
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <SignOutButton
        wrapperClassName="mt-auto"
        className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-rj-red-dark transition-colors hover:bg-rj-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
      >
        Sign out
      </SignOutButton>
    </aside>
  );
}
