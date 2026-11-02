// No imports on purpose: unit-tested with plain Node.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function trim(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** "3.2 h", "1.4 days", "12 min": one unit, one decimal at most; "—" when there is nothing to average. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < HOUR) return `${Math.max(1, Math.round(seconds / MINUTE))} min`;
  if (seconds < DAY) return `${trim(seconds / HOUR)} h`;
  const days = trim(seconds / DAY);
  return `${days} ${days === "1" ? "day" : "days"}`;
}
