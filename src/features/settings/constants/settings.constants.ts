import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/features/inventory/constants/inventory.constants";
import { RETURN_WINDOW_DAYS } from "@/features/returns/constants/return.constants";

/**
 * Read-only reference rows for the Settings → Platform policies card. These
 * values are fixed in code and inside SQL RPCs (see ARCHITECTURE.md Technical
 * Debt Register) — displaying them here does NOT make them editable.
 */
export const PLATFORM_POLICIES: readonly { label: string; value: string; note: string }[] = [
  { label: "Return window", value: `${RETURN_WINDOW_DAYS} days`, note: "After delivery or cancellation." },
  { label: "Unpaid online order expiry", value: "24 hours", note: "Stock is released automatically." },
  { label: "Guest cart expiry", value: "24 hours", note: "Of inactivity." },
  { label: "Low-stock threshold", value: `${DEFAULT_LOW_STOCK_THRESHOLD} units`, note: "Default for inventory status." },
];
