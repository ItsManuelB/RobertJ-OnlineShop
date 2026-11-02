import type { AdminActionLogEntry } from "../types/audit-log.types";

// Type-only imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

/** Date windows the Audit Log can narrow to; no range means all time. */
export const AUDIT_LOG_RANGES = ["24h", "7d", "30d"] as const;
export type AuditLogRange = (typeof AUDIT_LOG_RANGES)[number];

export const AUDIT_LOG_RANGE_LABELS: Record<AuditLogRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const RANGE_MS: Record<AuditLogRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function isAuditLogRange(value: string | null | undefined): value is AuditLogRange {
  return (AUDIT_LOG_RANGES as readonly string[]).includes(value ?? "");
}

/** ISO timestamp the window starts at, for a `created_at >= since` filter. */
export function auditRangeStart(range: AuditLogRange, now: number = Date.now()): string {
  return new Date(now - RANGE_MS[range]).toISOString();
}

/** The business timezone: days are Asia/Manila days everywhere else in the portals. */
export const AUDIT_LOG_TIME_ZONE = "Asia/Manila";

export interface AuditLogDayGroup {
  /** "Today", "Yesterday" or a medium date. */
  label: string;
  entries: AdminActionLogEntry[];
}

function dayKey(iso: string, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which sorts and compares as text.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/** Groups already newest-first entries under Today / Yesterday / date headings, keeping their order. */
export function groupEntriesByDay(
  entries: readonly AdminActionLogEntry[],
  now: number = Date.now(),
  timeZone: string = AUDIT_LOG_TIME_ZONE,
  locale: string = "en-PH",
): AuditLogDayGroup[] {
  const today = dayKey(new Date(now).toISOString(), timeZone);
  const yesterday = dayKey(new Date(now - 24 * 60 * 60 * 1000).toISOString(), timeZone);
  const groups: AuditLogDayGroup[] = [];
  let lastKey = "";
  for (const entry of entries) {
    const key = dayKey(entry.createdAt, timeZone);
    if (key !== lastKey) {
      const label =
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).format(new Date(entry.createdAt));
      groups.push({ label, entries: [] });
      lastKey = key;
    }
    groups[groups.length - 1].entries.push(entry);
  }
  return groups;
}
