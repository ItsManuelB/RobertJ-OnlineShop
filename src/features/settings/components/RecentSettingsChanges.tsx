import type { AdminActionLogEntry } from "@/features/audit-log/types/audit-log.types";
import { formatDateTime } from "@/lib/utils/date";

/** Metadata key suffix → label, in display order. Matches `admin_update_platform_settings`'s audit payload. */
const TRACKED_FIELDS = [
  { key: "support_email", label: "Support email" },
  { key: "support_phone", label: "Support phone" },
  { key: "business_address", label: "Business address" },
  { key: "business_hours", label: "Business hours" },
] as const;

function display(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "empty";
}

/** Only the fields whose value actually changed in this save. */
function describeChanges(metadata: AdminActionLogEntry["metadata"]): string[] {
  if (!metadata) return [];
  return TRACKED_FIELDS.flatMap(({ key, label }) => {
    const before = metadata[`previous_${key}`];
    const after = metadata[`new_${key}`];
    return before === after ? [] : [`${label}: ${display(before)} → ${display(after)}`];
  });
}

export interface RecentSettingsChangesProps {
  entries: readonly AdminActionLogEntry[];
}

/** The latest settings saves, newest first, with who made them and what changed. */
export function RecentSettingsChanges({ entries }: RecentSettingsChangesProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No settings changes yet.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) => {
        const changes = describeChanges(entry.metadata);
        return (
          <li key={entry.id} className="flex flex-col gap-1 py-2.5">
            <p className="text-sm font-medium text-foreground">
              {entry.actorName ?? "An administrator"}
              <span className="font-normal text-muted-foreground"> · {formatDateTime(entry.createdAt)}</span>
            </p>
            {changes.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {changes.map((change) => (
                  <li key={change} className="break-words">{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Saved with no changes.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
