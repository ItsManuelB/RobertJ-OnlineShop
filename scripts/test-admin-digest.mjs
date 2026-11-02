/**
 * Unit tests for the admin daily digest: when it is due, what it says, and how it renders.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-admin-digest.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { renderEmail } from "../src/lib/email/layout.ts";
import {
  ADMIN_DIGEST_MAX_LINES,
  ADMIN_DIGEST_REASON,
  adminDigestMessage,
  describeDigestStatus,
  getAdminDigestWindow,
  hasDigestContent,
} from "../src/features/notifications/utils/admin-digest.ts";

const URL = "https://shop.test/admin/returns-refunds";
const chrome = { logoUrl: "https://shop.test/brand/email-logo.png", siteUrl: "https://shop.test", settingsUrl: null, canReply: false };
const line = (orderNumber, days, status = "seller_accepted") => ({ orderNumber, days, status });
const input = (extra = {}) => ({
  waitingOnAdmin: [],
  waitingOnSellers: [],
  adminTargetDays: 2,
  sellerTargetDays: 3,
  ...extra,
});
const message = (extra, max) => adminDigestMessage(input(extra), URL, max);

test("the digest is due from 9:00 Philippine time, on the Philippine date", () => {
  // 00:59 UTC = 08:59 Manila: not yet. 01:00 UTC = 09:00 Manila: due.
  assert.deepEqual(getAdminDigestWindow(new Date("2026-11-03T00:59:00Z")), { date: "2026-11-03", due: false });
  assert.deepEqual(getAdminDigestWindow(new Date("2026-11-03T01:00:00Z")), { date: "2026-11-03", due: true });
  // 16:30 UTC on the 3rd is already 00:30 on the 4th in Manila: a new day, not due yet.
  assert.deepEqual(getAdminDigestWindow(new Date("2026-11-03T16:30:00Z")), { date: "2026-11-04", due: false });
  // 23:00 UTC is 07:00 the next morning in Manila: still before 9:00.
  assert.deepEqual(getAdminDigestWindow(new Date("2026-11-03T23:00:00Z")), { date: "2026-11-04", due: false });
  assert.deepEqual(getAdminDigestWindow(new Date("2026-11-04T01:00:00Z")), { date: "2026-11-04", due: true });
});

test("midnight in Manila is hour 0, not 24", () => {
  const window = getAdminDigestWindow(new Date("2026-11-03T16:00:00Z"));
  assert.equal(window.date, "2026-11-04");
  assert.equal(window.due, false);
});

test("nothing late means nothing to send", () => {
  assert.equal(hasDigestContent(input()), false);
  assert.equal(hasDigestContent(input({ waitingOnAdmin: [line("RJ-1", 3)] })), true);
  assert.equal(hasDigestContent(input({ waitingOnSellers: [line("RJ-2", 4, "pending")] })), true);
});

test("the subject counts each side and omits an empty one", () => {
  assert.equal(
    message({ waitingOnAdmin: [line("RJ-1", 3), line("RJ-2", 2)], waitingOnSellers: [line("RJ-3", 5, "pending")] }).subject,
    "Returns running late: 2 waiting on you, 1 waiting on sellers",
  );
  assert.equal(message({ waitingOnAdmin: [line("RJ-1", 3)] }).subject, "Returns running late: 1 waiting on you");
  assert.equal(message({ waitingOnSellers: [line("RJ-3", 5, "pending")] }).subject, "Returns running late: 1 waiting on sellers");
});

test("the headline's grammar follows the count", () => {
  assert.equal(message({ waitingOnAdmin: [line("RJ-1", 1)] }).headline, "1 return is running late");
  assert.equal(message({ waitingOnAdmin: [line("RJ-1", 3), line("RJ-2", 3)] }).headline, "2 returns are running late");
});

test("the preheader names the longest wait", () => {
  const m = message({ waitingOnAdmin: [line("RJ-1", 3)], waitingOnSellers: [line("RJ-2", 9, "pending")] });
  assert.equal(m.preheader, "Longest wait: 9 days, order RJ-2.");
});

test("the longest-waiting case is listed first, with its status and age", () => {
  const m = message({ waitingOnAdmin: [line("RJ-1", 2), line("RJ-2", 9, "return_received"), line("RJ-3", 1, "refund_due")] });
  const [section] = m.sections;
  assert.equal(section.heading, "Waiting on you (over 2 days)");
  assert.deepEqual(section.rows[0], { label: "RJ-2", text: "Item received, refund decision needed", pill: "9 days" });
  assert.equal(section.rows[2].pill, "1 day");
});

test("a long list is capped and says how many more", () => {
  const many = Array.from({ length: ADMIN_DIGEST_MAX_LINES + 4 }, (_, i) => line(`RJ-${i}`, 10 + i));
  const rows = message({ waitingOnAdmin: many }).sections[0].rows;
  assert.equal(rows.length, ADMIN_DIGEST_MAX_LINES + 1);
  assert.deepEqual(rows.at(-1), { label: "", text: "and 4 more", pill: "" });
});

test("both sections carry their own target and the wording makes clear nothing is automatic", () => {
  const m = message({ waitingOnAdmin: [line("RJ-1", 3)], waitingOnSellers: [line("RJ-2", 5, "pending")] });
  assert.deepEqual(m.sections.map((s) => s.heading), ["Waiting on you (over 2 days)", "Waiting on sellers (over 3 days)"]);
  assert.match(m.paragraphs[0], /nothing is decided or escalated automatically/);
});

test("every status an admin can see has plain words, and unknown ones do not leak a raw code", () => {
  for (const status of ["seller_accepted", "seller_rejected", "return_received", "refund_due", "pending", "return_shipped", "replacement_approved"]) {
    assert.doesNotMatch(describeDigestStatus(status), /_/, status);
  }
  assert.equal(describeDigestStatus("something_new"), "Waiting");
});

test("the subject fits a phone", () => {
  const m = message({ waitingOnAdmin: [line("RJ-1", 3)], waitingOnSellers: [line("RJ-2", 5, "pending")] });
  assert.ok(m.subject.length <= 60, `${m.subject.length} characters`);
});

test("rendered, each case is a table row with an age pill, escaped, and the reason is in the footer", () => {
  const mail = renderEmail(message({ waitingOnAdmin: [line("<b>RJ</b>", 3)] }), chrome);
  assert.match(mail.text, /Waiting on you \(over 2 days\)\n- <b>RJ<\/b>: Needs your decision \(3 days\)/);
  assert.match(mail.html, /<strong[^>]*>&lt;b&gt;RJ&lt;\/b&gt;<\/strong><br>Needs your decision/);
  assert.match(mail.html, />3 days<\/span>/);
  assert.doesNotMatch(mail.html, /<strong[^>]*><b>/);
  assert.match(mail.text, /Open returns: https:\/\/shop\.test\/admin\/returns-refunds/);
  assert.ok(mail.text.includes(ADMIN_DIGEST_REASON));
  assert.match(ADMIN_DIGEST_REASON, /only sent on a day when a return is running late/);
});
