import { Suspense } from "react";
import type { Metadata } from "next";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditLogActionFilter } from "@/features/audit-log/components/AuditLogActionFilter";
import { AuditLogTable } from "@/features/audit-log/components/AuditLogTable";
import {
  AUDIT_LOG_ACTIONS,
  isAuditLogAction,
} from "@/features/audit-log/constants/audit-log.constants";
import {
  auditRangeStart,
  isAuditLogRange,
  type AuditLogRange,
} from "@/features/audit-log/utils/audit-log-view";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { getAdminActionCounts, listAdminActionLog } from "@/lib/supabase/queries";
import { paginationSchema } from "@/lib/validations/common.schema";

export const metadata: Metadata = { title: "Audit Log — Admin Portal" };

function AuditLogSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <span className="sr-only">Loading audit log</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

interface AuditLogDataProps {
  action: string | null;
  range: AuditLogRange | null;
  page: number;
  pageSize: number;
}

/** L3: paginated + optionally filtered by action and date range — see `listAdminActionLog`'s doc comment. Ordering and the underlying records are unchanged. */
async function AuditLogData({ action, range, page, pageSize }: AuditLogDataProps) {
  const result = await listAdminActionLog({
    page,
    pageSize,
    action: action ?? undefined,
    since: range ? auditRangeStart(range) : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {result.total} entr{result.total === 1 ? "y" : "ies"}
      </p>
      <AuditLogTable entries={result.items} filtering={Boolean(action || range)} />
      {result.totalPages > 1 ? (
        <PaginationControls page={result.page} totalPages={result.totalPages} themed />
      ) : null}
    </div>
  );
}

interface AdminAuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminAuditLogPage({ searchParams }: AdminAuditLogPageProps) {
  const params = await searchParams;
  const actionParam = typeof params.action === "string" ? params.action : null;
  const action = isAuditLogAction(actionParam) ? actionParam : null;
  const rangeParam = typeof params.range === "string" ? params.range : null;
  const range = isAuditLogRange(rangeParam) ? rangeParam : null;

  const parsed = paginationSchema.safeParse(params);
  if (!parsed.success) {
    return (
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        <ErrorState message="Those filters aren't valid. Try clearing your search." />
      </div>
    );
  }
  const { page, pageSize } = parsed.data;

  // The per-action numbers are a nicety — a failed count just leaves the plain dropdown.
  const counts = await getAdminActionCounts(
    AUDIT_LOG_ACTIONS,
    range ? auditRangeStart(range) : undefined,
  ).catch(() => undefined);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">A permanent record of administrative actions.</p>
      </div>

      <Suspense fallback={null}>
        <AuditLogActionFilter counts={counts} />
      </Suspense>

      <Suspense key={JSON.stringify(params)} fallback={<AuditLogSkeleton />}>
        <AuditLogData action={action} range={range} page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}
