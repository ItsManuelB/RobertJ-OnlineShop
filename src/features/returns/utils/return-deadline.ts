// No imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface ShipBackDeadline {
  /** Plain-language time left, e.g. "3 days left" or "Deadline passed". */
  label: string;
  /** Under a day left, or already past: worth drawing the eye. */
  urgent: boolean;
  expired: boolean;
}

/**
 * How long the buyer has left to ship a Return and Refund item back. Information
 * only: the database rejects a late shipment and the sweep closes the request,
 * this just says how close the deadline is. A pure function of the two
 * timestamps so it renders the same on the server and in tests.
 */
export function getShipBackDeadline(deadlineIso: string, now: number = Date.now()): ShipBackDeadline {
  const left = new Date(deadlineIso).getTime() - now;
  if (left <= 0) return { label: "Deadline passed", urgent: true, expired: true };
  if (left < HOUR_MS) return { label: "Less than an hour left", urgent: true, expired: false };
  if (left < DAY_MS) {
    const hours = Math.floor(left / HOUR_MS);
    return { label: `${hours} hour${hours === 1 ? "" : "s"} left`, urgent: true, expired: false };
  }
  const days = Math.floor(left / DAY_MS);
  return { label: `${days} day${days === 1 ? "" : "s"} left`, urgent: false, expired: false };
}
