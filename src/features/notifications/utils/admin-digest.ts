// Types only on purpose: unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.
import type { EmailMessage } from "@/lib/email/layout";

/** The digest goes out once a day, from this hour (Philippine time) on. */
export const ADMIN_DIGEST_HOUR_MANILA = 9;
/** Lines listed per section; the rest are summarised as "and N more". */
export const ADMIN_DIGEST_MAX_LINES = 10;

export const ADMIN_DIGEST_REASON =
  "You get this daily digest because you are an administrator. It is only sent on a day when a return is running late.";

/** Philippine calendar date (`YYYY-MM-DD`) and whether today's digest is due yet. */
export function getAdminDigestWindow(now: Date): { date: string; due: boolean } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    due: Number(get("hour")) >= ADMIN_DIGEST_HOUR_MANILA,
  };
}

/** What a late case is waiting for, in the words an admin acts on. Unknown statuses fall back to a neutral phrase. */
export function describeDigestStatus(status: string): string {
  switch (status) {
    case "seller_accepted":
    case "seller_rejected":
      return "Needs your decision";
    case "return_received":
      return "Item received, refund decision needed";
    case "refund_due":
      return "COD payout to record";
    case "pending":
      return "Seller has not replied";
    case "return_shipped":
      return "Buyer shipped it back, seller has not confirmed receipt";
    case "replacement_approved":
      return "Replacement not shipped yet";
    default:
      return "Waiting";
  }
}

export interface DigestLine {
  orderNumber: string;
  /** Whole days it has been waiting. */
  days: number;
  status: string;
}

export interface AdminDigestInput {
  waitingOnAdmin: DigestLine[];
  waitingOnSellers: DigestLine[];
  adminTargetDays: number;
  sellerTargetDays: number;
}

function daysLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

function sectionRows(section: DigestLine[], max: number): NonNullable<EmailMessage["sections"]>[number]["rows"] {
  const rows = [...section]
    .sort((a, b) => b.days - a.days)
    .slice(0, max)
    .map((line) => ({ label: line.orderNumber, text: describeDigestStatus(line.status), pill: daysLabel(line.days) }));
  if (section.length > max) rows.push({ label: "", text: `and ${section.length - max} more`, pill: "" });
  return rows;
}

function plural(count: number): string {
  return `${count} return${count === 1 ? "" : "s"}`;
}

/** Whether there is anything to send. A digest with nothing late is never emailed. */
export function hasDigestContent(input: AdminDigestInput): boolean {
  return input.waitingOnAdmin.length + input.waitingOnSellers.length > 0;
}

/** The words of the daily admin digest. Pure: the caller decides who is late and supplies the link. */
export function adminDigestMessage(input: AdminDigestInput, url: string, max: number = ADMIN_DIGEST_MAX_LINES): EmailMessage {
  const { waitingOnAdmin, waitingOnSellers } = input;
  const late = waitingOnAdmin.length + waitingOnSellers.length;
  const subjectBits = [
    waitingOnAdmin.length > 0 ? `${waitingOnAdmin.length} waiting on you` : null,
    waitingOnSellers.length > 0 ? `${waitingOnSellers.length} waiting on sellers` : null,
  ].filter((bit): bit is string => bit !== null);

  const sections: NonNullable<EmailMessage["sections"]> = [];
  if (waitingOnAdmin.length > 0) {
    sections.push({ heading: `Waiting on you (over ${input.adminTargetDays} days)`, rows: sectionRows(waitingOnAdmin, max) });
  }
  if (waitingOnSellers.length > 0) {
    sections.push({ heading: `Waiting on sellers (over ${input.sellerTargetDays} days)`, rows: sectionRows(waitingOnSellers, max) });
  }

  const longest = [...waitingOnAdmin, ...waitingOnSellers].sort((a, b) => b.days - a.days)[0];

  return {
    subject: `Returns running late: ${subjectBits.join(", ")}`,
    preheader: longest ? `Longest wait: ${daysLabel(longest.days)}, order ${longest.orderNumber}.` : "Returns are running late.",
    badge: { label: "Daily digest", tone: "brand" },
    headline: `${plural(late)} ${late === 1 ? "is" : "are"} running late`,
    paragraphs: [
      "The longest-waiting cases come first. These are targets, not deadlines: nothing is decided or escalated automatically.",
    ],
    sections,
    cta: { label: "Open returns", url },
    reason: ADMIN_DIGEST_REASON,
  };
}
