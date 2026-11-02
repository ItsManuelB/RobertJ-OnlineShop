// No value imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

const MS_PER_MINUTE = 60_000;

/**
 * Minutes left before the oldest unpaid order is cancelled (never negative), or null when
 * nothing is waiting for payment. `now` defaults here, not in a component, so render stays pure.
 */
export function getHoldMinutesLeft(
  unpaidPlacedAt: readonly string[],
  expiryMinutes: number,
  now: number = Date.now(),
): number | null {
  const times = unpaidPlacedAt.map((value) => Date.parse(value)).filter((value) => !Number.isNaN(value));
  if (times.length === 0) return null;
  const deadline = Math.min(...times) + expiryMinutes * MS_PER_MINUTE;
  return Math.max(0, Math.ceil((deadline - now) / MS_PER_MINUTE));
}

/** "45 min left", "1 h 5 min left", or "Expiring now". */
export function formatHoldLeft(minutes: number): string {
  if (minutes <= 0) return "Expiring now";
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h left` : `${hours} h ${rest} min left`;
}
