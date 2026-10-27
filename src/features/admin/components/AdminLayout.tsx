"use client";

import type { PortalBadges, PortalNotification } from "@/components/portal/portal.types";
import { PortalShell } from "@/components/portal/PortalShell";
import type { SessionUser } from "@/types/common.types";

import { ADMIN_SHELL_CONFIG } from "../constants/nav";

export interface AdminLayoutProps {
  user: SessionUser;
  notifications: readonly PortalNotification[];
  badges: PortalBadges;
  children: React.ReactNode;
}

/** Admin Portal shell: the shared portal chrome with this portal's menu and data. */
export function AdminLayout({ user, notifications, badges, children }: AdminLayoutProps) {
  return (
    <PortalShell config={ADMIN_SHELL_CONFIG} user={user} notifications={notifications} badges={badges} shop={null}>
      {children}
    </PortalShell>
  );
}
