"use client";

import type { PortalBadges, PortalNotification, PortalShopCard } from "@/components/portal/portal.types";
import { PortalShell } from "@/components/portal/PortalShell";
import type { SessionUser } from "@/types/common.types";

import { SELLER_SHELL_CONFIG } from "../constants/nav";

export interface SellerLayoutProps {
  user: SessionUser;
  notifications: readonly PortalNotification[];
  badges: PortalBadges;
  shop: PortalShopCard | null;
  children: React.ReactNode;
}

/** Seller Portal shell: the shared portal chrome with this portal's menu and data. */
export function SellerLayout({ user, notifications, badges, shop, children }: SellerLayoutProps) {
  return (
    <PortalShell config={SELLER_SHELL_CONFIG} user={user} notifications={notifications} badges={badges} shop={shop}>
      {children}
    </PortalShell>
  );
}
