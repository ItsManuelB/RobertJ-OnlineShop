import Link from "next/link";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import { AUDIT_LOG_ACTION_LABELS, isAuditLogAction } from "@/features/audit-log/constants/audit-log.constants";
import { formatDateTime } from "@/lib/utils/date";
import { listAdminActionLog } from "@/lib/supabase/queries";

const ACTIVITY_LIMIT = 5;

/** The latest administrative actions, newest first, linking to the full Audit Log. */
export async function AdminRecentActivity() {
  let entries: Awaited<ReturnType<typeof listAdminActionLog>>["items"];
  try {
    entries = (await listAdminActionLog({ page: 1, pageSize: ACTIVITY_LIMIT })).items;
  } catch {
    return <ErrorState message="We couldn't load recent activity right now." />;
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-semibold">Recent admin activity</CardTitle>
        <Link href={ROUTES.adminAuditLog} className="text-xs font-semibold text-primary underline">
          Audit log
        </Link>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No administrative actions recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((entry) => {
              const target = entry.targetUserName ?? entry.targetShopName;
              return (
                <li key={entry.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium text-foreground">
                    {isAuditLogAction(entry.action) ? AUDIT_LOG_ACTION_LABELS[entry.action] : entry.action}
                    {target ? <span className="font-normal text-muted-foreground"> · {target}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actorName ?? "System"} · {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminRecentActivitySkeleton() {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-3 p-5" role="status">
        <span className="sr-only">Loading recent activity</span>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
