import "server-only";

import { publicEnv } from "@/config/env";
import { ROUTES } from "@/constants/routes";
import { getEmailChrome } from "@/lib/email/chrome";
import { renderEmail } from "@/lib/email/layout";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import * as queries from "@/lib/supabase/queries";
import {
  RETURN_ADMIN_DECISION_TARGET_DAYS,
  RETURN_SELLER_FULFILMENT_TARGET_DAYS,
  getWaitingStatus,
} from "@/features/returns";
import {
  adminDigestMessage,
  getAdminDigestWindow,
  hasDigestContent,
  type AdminDigestInput,
  type DigestLine,
} from "@/features/notifications/utils/admin-digest";

export interface AdminDigestSummary {
  /** False when no key or From address is set: nothing was looked up or sent. */
  configured: boolean;
  /** Whether it is past 9:00 Philippine time. Before that, nothing is looked up. */
  due: boolean;
  admins: number;
  /** How many returns were late when the digest was built (0 if every admin had already been handled today). */
  late: number;
  sent: number;
  /** Claimed but not sent: nothing was late, or the admin has no address / is inactive / is suppressed. */
  skipped: number;
  /** Send failed; the claim was released so the next run retries. */
  failed: number;
}

/** Which open returns are past their target, split by who they are waiting on. The definition of "late" is `getWaitingStatus`, shared with the admin bell. */
async function loadDigestInput(now: number): Promise<AdminDigestInput> {
  const returns = await queries.listReturnsForAdminDigest();
  const waitingOnAdmin: DigestLine[] = [];
  const waitingOnSellers: DigestLine[] = [];

  for (const request of returns) {
    const waiting = getWaitingStatus(
      request,
      { admin: RETURN_ADMIN_DECISION_TARGET_DAYS, seller: RETURN_SELLER_FULFILMENT_TARGET_DAYS },
      now,
    );
    if (!waiting?.pastTarget) continue;
    const entry = { orderNumber: request.orderNumber, days: waiting.days, status: request.status };
    if (waiting.actor === "admin") waitingOnAdmin.push(entry);
    else if (waiting.actor === "seller") waitingOnSellers.push(entry);
  }

  return {
    waitingOnAdmin,
    waitingOnSellers,
    adminTargetDays: RETURN_ADMIN_DECISION_TARGET_DAYS,
    sellerTargetDays: RETURN_SELLER_FULFILMENT_TARGET_DAYS,
  };
}

/**
 * Sends each active admin one digest a day of the returns running late, from
 * 9:00 Philippine time. Each admin is claimed for the day BEFORE anything is
 * built or sent, so overlapping runs cannot double-send; a day with nothing late
 * keeps the claim (it is "handled"), and a failed send releases it so the next
 * 15-minute run retries. Late cases are only a display signal in this app
 * (nothing escalates), and so is this email.
 */
export async function sendAdminReturnDigest(now: Date = new Date()): Promise<AdminDigestSummary> {
  const summary: AdminDigestSummary = { configured: false, due: false, admins: 0, late: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isEmailConfigured()) return summary;
  summary.configured = true;

  const window = getAdminDigestWindow(now);
  summary.due = window.due;
  if (!window.due) return summary;

  const adminIds = await queries.listActiveAdminIds();
  summary.admins = adminIds.length;

  // Built once, and only if some admin still needs today's digest.
  let input: AdminDigestInput | null = null;

  for (const adminId of adminIds) {
    let claimed = false;
    try {
      claimed = await queries.claimAdminDigest(window.date, adminId);
    } catch (error) {
      summary.failed++;
      console.error("[admin digest] claim failed", { adminId, error });
      continue;
    }
    if (!claimed) continue;

    try {
      input ??= await loadDigestInput(now.getTime());
      summary.late = input.waitingOnAdmin.length + input.waitingOnSellers.length;
      if (!hasDigestContent(input)) {
        summary.skipped++;
        continue;
      }

      const recipient = await queries.getEmailRecipient(adminId);
      if (!recipient.isActive || !recipient.email || recipient.isSuppressed) {
        summary.skipped++;
        continue;
      }

      const mail = renderEmail(
        adminDigestMessage(input, new URL(ROUTES.adminReturns, publicEnv.NEXT_PUBLIC_SITE_URL).toString()),
        getEmailChrome(null),
      );
      await sendEmail({
        to: recipient.email,
        ...mail,
        idempotencyKey: `admin-digest:${window.date}:${adminId}`,
      });
      summary.sent++;
    } catch (error) {
      summary.failed++;
      // Message only: the provider's response can echo the recipient's address.
      console.error("[admin digest] send failed", {
        adminId,
        message: error instanceof Error ? error.message : "unknown error",
      });
      await queries.releaseAdminDigest(window.date, adminId).catch((releaseError) => {
        console.error("[admin digest] could not release the claim", { adminId, releaseError });
      });
    }
  }

  return summary;
}
