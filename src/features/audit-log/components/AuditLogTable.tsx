import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import {
  AUDIT_LOG_ACTION_LABELS,
  AUDIT_LOG_ACTION_TONE,
} from "@/features/audit-log/constants/audit-log.constants";
import type { AdminActionLogEntry } from "@/features/audit-log/types/audit-log.types";
import { formatDateTime } from "@/lib/utils/date";

/** Known actions (`AUDIT_LOG_ACTION_LABELS`/`_TONE`) get a friendly label + tone; anything else (a future RPC that starts logging) falls back to the raw action string — never hidden, never crashes on an unrecognized value. */
function actionLabel(action: string): string {
  return (AUDIT_LOG_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

function actionTone(action: string): "neutral" | "info" | "success" | "danger" {
  return (
    (AUDIT_LOG_ACTION_TONE as Record<string, "neutral" | "info" | "success" | "danger">)[
      action
    ] ?? "neutral"
  );
}

export interface AuditLogTableProps {
  entries: AdminActionLogEntry[];
  /** True when an action filter is active — swaps the empty-state copy (L3). */
  filtering?: boolean;
}

export function AuditLogTable({ entries, filtering = false }: AuditLogTableProps) {
  if (entries.length === 0) {
    return filtering ? (
      <EmptyState
        title="No matching actions"
        description="Try a different action filter."
      />
    ) : (
      <EmptyState
        title="No administrative actions logged yet"
        description="High-stakes actions — account deactivation, refund decisions, seller/shop assignment — will appear here as they happen."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => {
        const thresholdChange = entry.action === "update_inventory_threshold" ? entry.metadata : null;
        return (
        <Card key={entry.id}>
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge>
              </div>
              <p className="mt-1.5 text-sm text-foreground">
                <span className="font-semibold">{entry.actorName ?? "Unknown admin"}</span>
                {entry.targetUserName ? (
                  <>
                    {" "}
                    → <span className="font-semibold">{entry.targetUserName}</span>
                  </>
                ) : null}
                {entry.targetShopName ? (
                  <>
                    {" "}
                    (<span className="font-semibold">{entry.targetShopName}</span>)
                  </>
                ) : null}
              </p>
              {thresholdChange ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {typeof thresholdChange.product_title === "string" ? `${thresholdChange.product_title}: ` : "Item: "}
                  {typeof thresholdChange.previous_effective === "number" ? thresholdChange.previous_effective : "?"}
                  {" → "}
                  {typeof thresholdChange.new_effective === "number" ? thresholdChange.new_effective : "?"}
                  {thresholdChange.new_override === null ? " (using admin default)" : " (seller override)"}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
