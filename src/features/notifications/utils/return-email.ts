// No value imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

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
}

export interface ReturnEmailContent {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
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

/** The words of one email. The order emails reuse the layout and only supply their own text. */
export interface EmailParts {
  subject: string;
  intro: string;
  detail: string;
  cta: string;
}

function partsFor(input: ReturnEmailInput): EmailParts {
  const { kind, orderNumber, deadlineAt } = input;
  const by = deadlineAt ? formatDeadline(deadlineAt) : null;
  switch (kind) {
    case "seller_new_request":
      return {
        subject: `New return request for order ${orderNumber}`,
        intro: `A buyer asked for a return or refund on order ${orderNumber}.`,
        detail: by
          ? `Please read the reason and photo, then accept or reject it by ${by}.`
          : "Please read the reason and photo, then accept or reject it.",
        cta: "Open returns",
      };
    case "seller_response_reminder":
      return {
        subject: `Reply needed: return request for order ${orderNumber}`,
        intro: `The return request for order ${orderNumber} is still waiting for your answer.`,
        detail: by
          ? `Please accept or reject it by ${by}. After that, the admin can decide without your reply.`
          : "Please accept or reject it. After the response time, the admin can decide without your reply.",
        cta: "Open returns",
      };
    case "buyer_return_approved":
      return {
        subject: by
          ? `Return approved: ship back order ${orderNumber} by ${by}`
          : `Return approved for order ${orderNumber}`,
        intro: `Your return for order ${orderNumber} was approved.`,
        detail: by
          ? `Please ship the item back and enter the courier and tracking number on your order page by ${by}. If it is not shipped in time, the request closes and nothing is refunded.`
          : "Please ship the item back and enter the courier and tracking number on your order page.",
        cta: "Open my order",
      };
    case "buyer_ship_back_reminder":
      return {
        subject: by
          ? `Reminder: ship back order ${orderNumber} by ${by}`
          : `Reminder: ship back order ${orderNumber}`,
        intro: `Your return for order ${orderNumber} is waiting for you to ship the item back.`,
        detail: by
          ? `The deadline is ${by}. Enter the courier and tracking number on your order page once you have shipped it. If it is not shipped in time, the request closes and nothing is refunded.`
          : "Enter the courier and tracking number on your order page once you have shipped it.",
        cta: "Open my order",
      };
    case "buyer_return_refunded":
      return {
        subject: `Refund issued for order ${orderNumber}`,
        intro: `Your refund for order ${orderNumber} has been issued.`,
        detail:
          "How soon it shows in your account depends on your bank or e-wallet. Open your order to see the details.",
        cta: "Open my order",
      };
    case "buyer_return_rejected":
      return {
        subject: `Return request not approved for order ${orderNumber}`,
        intro: `Your return request for order ${orderNumber} was not approved.`,
        detail: "Open your order to see the decision and any note from the admin.",
        cta: "Open my order",
      };
    case "buyer_return_expired":
      return {
        subject: `Return closed for order ${orderNumber}: not shipped back in time`,
        intro: `Your return for order ${orderNumber} was closed because the item was not shipped back by the deadline.`,
        detail: "Nothing is refunded for a closed return. Open your order for details.",
        cta: "Open my order",
      };
  }
}

const FOOTER: Record<ReturnEmailAudience, string> = {
  buyer: "You receive this because order update emails are on in your account notification settings.",
  seller: "You receive this because return alerts are on in your seller notification settings.",
};

/** Subject, plain text and HTML for one email from its words. Pure: the caller supplies the link and the footer. */
export function renderEmail(parts: EmailParts, url: string, footer: string): ReturnEmailContent {
  const text = `${parts.intro}\n\n${parts.detail}\n\n${parts.cta}: ${url}\n\n${footer}\n`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d2327;max-width:560px">` +
    `<p>${escapeHtml(parts.intro)}</p>` +
    `<p>${escapeHtml(parts.detail)}</p>` +
    `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#d62828;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(parts.cta)}</a></p>` +
    `<p style="font-size:12px;color:#5d676d">${escapeHtml(footer)}</p>` +
    `</div>`;
  return { subject: parts.subject, text, html };
}

/** Subject, plain text and HTML for one return email. Pure: the caller supplies the link and the times. */
export function buildReturnEmail(input: ReturnEmailInput): ReturnEmailContent {
  return renderEmail(partsFor(input), input.url, FOOTER[getReturnEmailAudience(input.kind)]);
}
