// Types only on purpose: unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.
import type { EmailParts } from "./return-email";

/** The digest goes out once a day, from this hour (Philippine time) on. */
export const ADMIN_DIGEST_HOUR_MANILA = 9;
/** Lines listed per section; the rest are summarised as "and N more". */
export const ADMIN_DIGEST_MAX_LINES = 10;

export const ADMIN_DIGEST_FOOTER =
  "You receive this daily digest because you are an administrator. It is only sent on a day when a return is running late.";

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
      return "needs your decision";
    case "return_received":
      return "item received, refund decision needed";
    case "refund_due":
      return "COD payout to record";
    case "pending":
      return "seller has not replied";
    case "return_shipped":
      return "buyer shipped it back, seller has not confirmed receipt";
    case "replacement_approved":
      return "replacement not shipped yet";
    default:
      return "waiting";
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

function lines(section: DigestLine[], max: number): string[] {
  const shown = [...section]
    .sort((a, b) => b.days - a.days)
    .slice(0, max)
    .map((line) => `Order ${line.orderNumber}: ${describeDigestStatus(line.status)} (${line.days} day${line.days === 1 ? "" : "s"})`);
  if (section.length > max) shown.push(`and ${section.length - max} more`);
  return shown;
}

function plural(count: number): string {
  return `${count} return${count === 1 ? "" : "s"}`;
}

/** Whether there is anything to send. A digest with nothing late is never emailed. */
export function hasDigestContent(input: AdminDigestInput): boolean {
  return input.waitingOnAdmin.length + input.waitingOnSellers.length > 0;
}

/** The words of the daily admin digest. Pure: the caller decides who is late and renders it. */
export function adminDigestParts(input: AdminDigestInput, max: number = ADMIN_DIGEST_MAX_LINES): EmailParts {
  const { waitingOnAdmin, waitingOnSellers } = input;
  const subjectBits = [
    waitingOnAdmin.length > 0 ? `${waitingOnAdmin.length} waiting on you` : null,
    waitingOnSellers.length > 0 ? `${waitingOnSellers.length} waiting on sellers` : null,
  ].filter((bit): bit is string => bit !== null);

  const sections: NonNullable<EmailParts["sections"]> = [];
  if (waitingOnAdmin.length > 0) {
    sections.push({ heading: `Waiting on you (over ${input.adminTargetDays} days)`, items: lines(waitingOnAdmin, max) });
  }
  if (waitingOnSellers.length > 0) {
    sections.push({ heading: `Waiting on sellers (over ${input.sellerTargetDays} days)`, items: lines(waitingOnSellers, max) });
  }

  return {
    subject: `Returns running late: ${subjectBits.join(", ")}`,
    intro: `${plural(waitingOnAdmin.length + waitingOnSellers.length)} ${waitingOnAdmin.length + waitingOnSellers.length === 1 ? "is" : "are"} running late.`,
    detail: "The longest-waiting cases are listed first. These are targets, not deadlines: nothing is decided or escalated automatically.",
    sections,
    cta: "Open returns",
  };
}
