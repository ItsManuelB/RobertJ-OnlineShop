import "server-only";

import { publicEnv } from "@/config/env";
import { ROUTES } from "@/constants/routes";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import * as queries from "@/lib/supabase/queries";
import {
  ORDER_EMAIL_FOOTER,
  getOrderEmailAudience,
  isOrderEmailKind,
  isSellerOrderEmailAllowed,
  orderEmailParts,
} from "@/features/notifications/utils/order-email";
import { isBuyerReturnEmailAllowed, renderEmail } from "@/features/notifications/utils/return-email";

export interface OrderEmailSweepSummary {
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
 * Claims, then sends, each due order email. The claim is taken in the database
 * BEFORE the send, so the immediate send after checkout and the 15-minute sweep
 * can run at the same time without either sending a message twice. A failed
 * send releases the claim so the next run retries it; an opted-out recipient
 * keeps the claim so they are not listed again on every run. Never throws for
 * one bad message.
 */
async function deliverDueOrderEmails(due: queries.DueOrderNotification[], summary: OrderEmailSweepSummary): Promise<void> {
  for (const item of due) {
    if (!isOrderEmailKind(item.kind)) continue;
    const kind = item.kind;

    let claimed = false;
    try {
      claimed = await queries.claimOrderNotification(item.orderId, kind);
    } catch (error) {
      summary.failed++;
      console.error("[order email] claim failed", { orderId: item.orderId, kind, error });
      continue;
    }
    if (!claimed) continue;

    try {
      const recipient = await queries.getEmailRecipient(item.recipientId);
      const audience = getOrderEmailAudience(kind);
      // The buyer's "email" and "order updates" switches gate order emails exactly as they gate return emails.
      const allowed =
        recipient.isActive &&
        (audience === "buyer"
          ? isBuyerReturnEmailAllowed(recipient.buyerPrefs)
          : isSellerOrderEmailAllowed(recipient.sellerPrefs));
      if (!allowed || !recipient.email || recipient.isSuppressed) {
        summary.skipped++;
        continue;
      }

      const path = audience === "buyer" ? ROUTES.orderDetail(item.orderId) : ROUTES.sellerOrders;
      const mail = renderEmail(
        orderEmailParts({
          kind,
          orderNumber: item.orderNumber,
          totalCents: item.totalCents,
          currency: item.currency,
          paymentMethod: item.paymentMethod,
          paymentStatus: item.paymentStatus,
          itemCount: item.itemCount,
        }),
        new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).toString(),
        ORDER_EMAIL_FOOTER[audience],
      );
      await sendEmail({
        to: recipient.email,
        ...mail,
        idempotencyKey: `order-email:${kind}:${item.orderId}`,
      });
      summary.sent++;
    } catch (error) {
      summary.failed++;
      // Message only: the provider's response can echo the recipient's address.
      console.error("[order email] send failed", {
        orderId: item.orderId,
        kind,
        message: error instanceof Error ? error.message : "unknown error",
      });
      await queries.releaseOrderNotification(item.orderId, kind).catch((releaseError) => {
        console.error("[order email] could not release the claim", { orderId: item.orderId, kind, releaseError });
      });
    }
  }
}

/**
 * Sends the order emails that are due: the buyer's shipped and delivered
 * notices, plus the receipt and the seller's new-order notice for anything the
 * immediate send after checkout missed. Runs inside the existing reconciliation
 * sweep (every ~15 minutes).
 */
export async function sendDueOrderEmails(limit = 25): Promise<OrderEmailSweepSummary> {
  const summary: OrderEmailSweepSummary = { configured: false, due: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isEmailConfigured()) return summary;
  summary.configured = true;

  const due = await queries.listDueOrderNotifications(limit);
  summary.due = due.length;
  await deliverDueOrderEmails(due, summary);
  return summary;
}

/**
 * The immediate send after checkout: the receipt, and (for cash on delivery) the
 * seller's new-order notice, so neither waits for the next sweep. Uses the same
 * eligibility rules and claims as the sweep, which stays as the backstop if this
 * fails. Meant for `after()`: it never throws and never blocks the response.
 */
export async function sendOrderEmailsFor(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0 || !isEmailConfigured()) return;
  const summary: OrderEmailSweepSummary = { configured: true, due: 0, sent: 0, skipped: 0, failed: 0 };
  try {
    const due = await queries.listDueOrderNotifications(orderIds.length * 4, orderIds);
    summary.due = due.length;
    await deliverDueOrderEmails(due, summary);
  } catch (error) {
    console.error("[order email] immediate send failed; the sweep will retry", error);
  }
}
