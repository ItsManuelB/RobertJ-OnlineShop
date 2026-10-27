/** Placed-date windows for the buyer `/orders` filter; the URL carries the key, `undefined` means any date. */
export const BUYER_PLACED_WINDOWS = ["30d", "90d", "year"] as const;

export type BuyerPlacedWindow = (typeof BUYER_PLACED_WINDOWS)[number];

export const BUYER_PLACED_LABELS: Record<BuyerPlacedWindow, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
};

export const BUYER_PLACED_ANY_LABEL = "Any date";
