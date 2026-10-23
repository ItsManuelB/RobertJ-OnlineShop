import { RETURN_WINDOW_DAYS } from "@/features/returns/constants/return.constants";

/**
 * Read-only reference rows for the fixed Platform policies card. The
 * low-stock default is rendered from persisted settings beside this list.
 */
export const PLATFORM_POLICIES: readonly { label: string; value: string; note: string }[] = [
  { label: "Return window", value: `${RETURN_WINDOW_DAYS} days`, note: "After delivery or cancellation." },
  { label: "Unpaid online order expiry", value: "60 minutes", note: "Stock is released automatically." },
  { label: "Guest cart expiry", value: "24 hours", note: "Of inactivity." },
];
