// Types only on purpose: unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.
import type { EmailMessage } from "@/lib/email/layout";

/** Mirrors the `kind` check constraint on `return_notification_log`. */
export const RETURN_EMAIL_KINDS = [
  "seller_new_request",
  "seller_response_reminder",
  "buyer_return_approved",
  "buyer_ship_back_reminder",
  "buyer_return_refunded",
  "buyer_return_rejected",
  "buyer_return_expired",
] as const;
export type ReturnEmailKind = (typeof RETURN_EMAIL_KINDS)[number];
export type ReturnEmailAudience = "buyer" | "seller";

export function isReturnEmailKind(value: string): value is ReturnEmailKind {
  return (RETURN_EMAIL_KINDS as readonly string[]).includes(value);
}

export function getReturnEmailAudience(kind: ReturnEmailKind): ReturnEmailAudience {
  return kind.startsWith("seller_") ? "seller" : "buyer";
}

/** The stored switches that gate a return email. A missing row means "never changed", which is on. */
export interface BuyerEmailPrefs {
  emailEnabled: boolean;
  orderUpdates: boolean;
}
export interface SellerEmailPrefs {
  alertReturns: boolean;
}

export function isBuyerReturnEmailAllowed(prefs: BuyerEmailPrefs | null): boolean {
  return prefs === null || (prefs.emailEnabled && prefs.orderUpdates);
}

export function isSellerReturnEmailAllowed(prefs: SellerEmailPrefs | null): boolean {
  return prefs === null || prefs.alertReturns;
}

export interface ReturnEmailInput {
  kind: ReturnEmailKind;
  orderNumber: string;
  /** Absolute link to the page where the recipient acts. */
  url: string;
  /** The seller's reply-by time, or the buyer's ship-back deadline. Null for outcomes with no deadline. */
  deadlineAt: string | null;
  /** The refund as shown to the buyer (already formatted), when known. Only the refund email uses it. */
  refundAmount?: string | null;
}

/** "Sat, 7 Nov 2026, 3:20 pm (Philippine time)". Shown in Manila time whatever the server's zone is. */
export function formatDeadline(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  return `${formatted} (Philippine time)`;
}

/** "7 Nov", for places too short for the full deadline (the subject line). Manila time. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short" }).format(new Date(iso));
}

/** Why the person got the email, by audience. */
export const RETURN_EMAIL_REASON: Record<ReturnEmailAudience, string> = {
  buyer: "You get this because order update emails are on for your account.",
  seller: "You get this because return alerts are on for your seller account.",
};

/** The words of one return email. Pure: the caller supplies the link and the amounts. */
export function returnEmailMessage(input: ReturnEmailInput): EmailMessage {
  const { kind, orderNumber, deadlineAt, url } = input;
  const by = deadlineAt ? formatDeadline(deadlineAt) : null;
  const byShort = deadlineAt ? formatShortDate(deadlineAt) : null;
  const reason = RETURN_EMAIL_REASON[getReturnEmailAudience(kind)];
  const orderRow = { label: "Order", value: orderNumber };

  switch (kind) {
    case "seller_new_request":
      return {
        subject: `New return request for order ${orderNumber}`,
        preheader: byShort ? `Reply by ${byShort}.` : "Open it to accept or reject.",
        badge: { label: "Action needed", tone: "warning" },
        headline: "A buyer asked for a return",
        paragraphs: ["Please read the reason and photo, then accept or reject it."],
        rows: [orderRow],
        callout: by ? { label: "Reply by", text: by } : undefined,
        cta: { label: "Open returns", url },
        reason,
      };
    case "seller_response_reminder":
      return {
        subject: `Reply needed: return request for ${orderNumber}`,
        preheader: byShort ? `After ${byShort} the admin can decide without you.` : "The admin can decide without your reply.",
        badge: { label: "Reminder", tone: "warning" },
        headline: "A return is waiting for your answer",
        paragraphs: ["Please accept or reject it. After the reply time, the admin can decide without your reply."],
        rows: [orderRow],
        callout: by ? { label: "Reply by", text: by } : undefined,
        cta: { label: "Open returns", url },
        reason,
      };
    case "buyer_return_approved":
      return {
        subject: byShort ? `Return approved for ${orderNumber}: ship back by ${byShort}` : `Return approved for order ${orderNumber}`,
        preheader: "Ship it back and add the tracking number.",
        badge: { label: "Return approved", tone: "success" },
        headline: "Your return was approved",
        paragraphs: [
          by
            ? `Order ${orderNumber} can be sent back. If it is not shipped in time, the request closes and nothing is refunded.`
            : `Order ${orderNumber} can be sent back.`,
        ],
        callout: by ? { label: "Ship back by", text: by } : undefined,
        steps: [
          "Pack the item with its tags.",
          "Ship it with any courier.",
          "Enter the courier and tracking number on your order page.",
        ],
        cta: { label: "Add tracking number", url },
        reason,
      };
    case "buyer_ship_back_reminder":
      return {
        subject: byShort ? `Reminder: ship back ${orderNumber} by ${byShort}` : `Reminder: ship back order ${orderNumber}`,
        preheader: "Your return closes if it is not shipped in time.",
        badge: { label: "Reminder", tone: "warning" },
        headline: "Your return is waiting to be shipped",
        paragraphs: [
          by
            ? `Order ${orderNumber} is waiting for you to ship the item back. Enter the courier and tracking number once you have shipped it. If it is not shipped in time, the request closes and nothing is refunded.`
            : `Order ${orderNumber} is waiting for you to ship the item back. Enter the courier and tracking number once you have shipped it.`,
        ],
        callout: by ? { label: "Ship back by", text: by } : undefined,
        cta: { label: "Add tracking number", url },
        reason,
      };
    case "buyer_return_refunded":
      return {
        subject: `Refund issued for order ${orderNumber}`,
        preheader: input.refundAmount ? `${input.refundAmount} is on its way back to you.` : "Your refund has been issued.",
        badge: { label: "Refund issued", tone: "success" },
        headline: "Your refund has been issued",
        paragraphs: ["How soon it shows in your account depends on your bank or e-wallet."],
        rows: input.refundAmount ? [orderRow, { label: "Refund amount", value: input.refundAmount }] : [orderRow],
        cta: { label: "View my order", url },
        reason,
      };
    case "buyer_return_rejected":
      return {
        subject: `Return request not approved for ${orderNumber}`,
        preheader: "See the decision and the admin's note.",
        badge: { label: "Not approved", tone: "danger" },
        headline: "Your return was not approved",
        paragraphs: ["Open your order to see the decision and any note from the admin."],
        rows: [orderRow],
        cta: { label: "View the decision", url },
        reason,
      };
    case "buyer_return_expired":
      return {
        subject: `Return closed for order ${orderNumber}`,
        preheader: "It was not shipped back by the deadline.",
        badge: { label: "Return closed", tone: "danger" },
        headline: "Your return was closed",
        paragraphs: ["The item was not shipped back by the deadline, so nothing is refunded. Open your order for details."],
        rows: [orderRow],
        cta: { label: "View my order", url },
        reason,
      };
  }
}
