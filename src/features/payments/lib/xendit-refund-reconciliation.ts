import { getRefundStatus, xenditAmountToCents } from "@/lib/xendit/client";
import * as queries from "@/lib/supabase/queries";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Catch-up for refunds whose `refund.*` webhook is late or never delivered
 * (payments have the same safety net in `xendit-reconciliation.ts`). Asks
 * Xendit for the refund's real status and applies it through
 * `process_xendit_refund_webhook`, so Xendit stays the only source of truth
 * and a webhook that arrives afterwards is a harmless duplicate. A non-final
 * status is left alone; any Xendit/RPC error returns "unchanged".
 */
/** Statuses `process_xendit_refund_webhook` acts on; anything else (PENDING, unknown) is left for later. */
const TERMINAL_REFUND_STATUSES = ["SUCCEEDED", "FAILED", "CANCELLED"];

export type RefundReconciliationOutcome = "settled" | "unchanged";

export async function reconcileXenditRefund(
  xenditRefundId: string,
): Promise<RefundReconciliationOutcome> {
  try {
    const refund = await getRefundStatus(xenditRefundId);
    if (!TERMINAL_REFUND_STATUSES.includes(refund.status)) return "unchanged";

    await queries.applyXenditRefundStatus({
      xenditRefundId,
      status: refund.status,
      failureCode: refund.failure_code ?? "",
      amountCents: typeof refund.amount === "number" ? xenditAmountToCents(refund.amount) : 0,
      rawPayload: { source: "reconciliation_check", refund } as unknown as Json,
    });
    return "settled";
  } catch {
    return "unchanged";
  }
}
