import "server-only";

import { publicEnv } from "@/config/env";
import { ROUTES } from "@/constants/routes";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import * as queries from "@/lib/supabase/queries";
import {
  buildReturnEmail,
  getReturnEmailAudience,
  isBuyerReturnEmailAllowed,
  isReturnEmailKind,
  isSellerReturnEmailAllowed,
} from "@/features/notifications/utils/return-email";

export interface ReturnEmailSweepSummary {
  /** False when no key or From address is set: nothing was looked up or sent. */
  configured: boolean;
  due: number;
  sent: number;
  /** Claimed but not sent: the person opted out, is inactive or has no address. */
  skipped: number;
  /** Send failed; the claim was released so the next run retries. */
  failed: number;
}

/**
 * Sends the return/refund emails that are due: a new request for the seller, a
 * reminder before the seller's reply time runs out, a Return and Refund
 * approval for the buyer, a reminder before the buyer's ship-back deadline, and
 * the buyer's outcome emails (refund issued, request rejected, return expired).
 *
 * Runs inside the existing reconciliation sweep (every ~15 minutes). Each
 * message is claimed in the database before it is sent, so overlapping runs
 * cannot double-send, and the claim is released if the send fails so the next
 * run tries again. A recipient who opted out keeps the claim, so they are not
 * listed again on every run. Never throws for one bad message.
 */
export async function sendDueReturnEmails(limit = 25): Promise<ReturnEmailSweepSummary> {
  const summary: ReturnEmailSweepSummary = { configured: false, due: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isEmailConfigured()) return summary;
  summary.configured = true;

  const due = await queries.listDueReturnNotifications(limit);
  summary.due = due.length;

  for (const item of due) {
    if (!isReturnEmailKind(item.kind)) continue;
    const kind = item.kind;

    let claimed = false;
    try {
      claimed = await queries.claimReturnNotification(item.returnRequestId, kind);
    } catch (error) {
      summary.failed++;
      console.error("[return email sweep] claim failed", { returnId: item.returnRequestId, kind, error });
      continue;
    }
    if (!claimed) continue;

    try {
      const recipient = await queries.getEmailRecipient(item.recipientId);
      const audience = getReturnEmailAudience(kind);
      const allowed =
        recipient.isActive &&
        (audience === "buyer"
          ? isBuyerReturnEmailAllowed(recipient.buyerPrefs)
          : isSellerReturnEmailAllowed(recipient.sellerPrefs));
      if (!allowed || !recipient.email || recipient.isSuppressed) {
        summary.skipped++;
        continue;
      }

      const path = audience === "buyer" ? ROUTES.orderDetail(item.orderId) : ROUTES.sellerReturns;
      const mail = buildReturnEmail({
        kind,
        orderNumber: item.orderNumber,
        url: new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).toString(),
        deadlineAt: item.deadlineAt,
      });
      await sendEmail({
        to: recipient.email,
        ...mail,
        idempotencyKey: `return-email:${kind}:${item.returnRequestId}`,
      });
      summary.sent++;
    } catch (error) {
      summary.failed++;
      // Message only: the provider's response can echo the recipient's address.
      console.error("[return email sweep] send failed", {
        returnId: item.returnRequestId,
        kind,
        message: error instanceof Error ? error.message : "unknown error",
      });
      await queries.releaseReturnNotification(item.returnRequestId, kind).catch((releaseError) => {
        console.error("[return email sweep] could not release the claim", {
          returnId: item.returnRequestId,
          kind,
          releaseError,
        });
      });
    }
  }

  return summary;
}
