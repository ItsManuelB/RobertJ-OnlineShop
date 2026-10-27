import type { ReactNode } from "react";

import { ADMIN_ONLY_ROLES } from "@/constants/roles";
import type { PortalBadges, PortalNotification } from "@/components/portal/portal.types";
import { AdminLayout } from "@/features/admin";
import { getAdminNotifications } from "@/features/admin/utils/admin-tasks.server";
import { requireRole } from "@/lib/supabase/queries";

/** Menu badges from the same entries as the bell: items waiting per destination, red only when something is overdue. */
function getAdminNavBadges(notifications: readonly PortalNotification[]): PortalBadges {
  const badges: Record<string, { count: number; urgent?: boolean }> = {};
  for (const entry of notifications) {
    // Entries may deep-link with a filter; the menu item is the bare path.
    const path = entry.href.split("?")[0];
    const current = badges[path] ?? { count: 0 };
    badges[path] = {
      count: current.count + (entry.count ?? 1),
      urgent: current.urgent || entry.id === "overdue-returns",
    };
  }
  return badges;
}

export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(ADMIN_ONLY_ROLES);
  const notifications = await getAdminNotifications();

  return (
    <AdminLayout user={user} notifications={notifications} badges={getAdminNavBadges(notifications)}>
      {children}
    </AdminLayout>
  );
}
