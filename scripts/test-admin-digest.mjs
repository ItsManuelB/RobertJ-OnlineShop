/**
 * Unit tests for the admin daily digest: when it is due, what it says, and how it renders.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-admin-digest.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_DIGEST_FOOTER,
  ADMIN_DIGEST_MAX_LINES,
  adminDigestParts,
  describeDigestStatus,
  getAdminDigestWindow,
  hasDigestContent,
} from "../src/features/notifications/utils/admin-digest.ts";
import { renderEmail } from "../src/features/notifications/utils/return-email.ts";

const line = (orderNumber, days, status = "seller_accepted") => ({ orderNumber, days, status });
const input = (extra = {}) => ({
  waitingOnAdmin: [],
  waitingOnSellers: [],
  adminTargetDays: 2,
  sellerTargetDays: 3,
  ...extra,
});

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
    adminDigestParts(input({ waitingOnAdmin: [line("RJ-1", 3), line("RJ-2", 2)], waitingOnSellers: [line("RJ-3", 5, "pending")] })).subject,
    "Returns running late: 2 waiting on you, 1 waiting on sellers",
  );
  assert.equal(adminDigestParts(input({ waitingOnAdmin: [line("RJ-1", 3)] })).subject, "Returns running late: 1 waiting on you");
  assert.equal(adminDigestParts(input({ waitingOnSellers: [line("RJ-3", 5, "pending")] })).subject, "Returns running late: 1 waiting on sellers");
});

test("grammar follows the count", () => {
  assert.match(adminDigestParts(input({ waitingOnAdmin: [line("RJ-1", 1)] })).intro, /^1 return is running late\.$/);
  assert.match(adminDigestParts(input({ waitingOnAdmin: [line("RJ-1", 3), line("RJ-2", 3)] })).intro, /^2 returns are running late\.$/);
});

test("the longest-waiting case is listed first, with its status and days", () => {
  const parts = adminDigestParts(input({ waitingOnAdmin: [line("RJ-1", 2), line("RJ-2", 9, "return_received"), line("RJ-3", 1, "refund_due")] }));
  const [section] = parts.sections;
  assert.equal(section.heading, "Waiting on you (over 2 days)");
  assert.equal(section.items[0], "Order RJ-2: item received, refund decision needed (9 days)");
  assert.match(section.items[2], /1 day\)/);
  assert.doesNotMatch(section.items[2], /1 days/);
});

test("a long list is capped and says how many more", () => {
  const many = Array.from({ length: ADMIN_DIGEST_MAX_LINES + 4 }, (_, i) => line(`RJ-${i}`, 10 + i));
  const items = adminDigestParts(input({ waitingOnAdmin: many })).sections[0].items;
  assert.equal(items.length, ADMIN_DIGEST_MAX_LINES + 1);
  assert.equal(items.at(-1), "and 4 more");
});

test("both sections carry their own target and the wording makes clear nothing is automatic", () => {
  const parts = adminDigestParts(input({ waitingOnAdmin: [line("RJ-1", 3)], waitingOnSellers: [line("RJ-2", 5, "pending")] }));
  assert.deepEqual(parts.sections.map((s) => s.heading), ["Waiting on you (over 2 days)", "Waiting on sellers (over 3 days)"]);
  assert.match(parts.detail, /nothing is decided or escalated automatically/);
});

test("every status an admin can see has plain words, and unknown ones do not leak a raw code", () => {
  for (const status of ["seller_accepted", "seller_rejected", "return_received", "refund_due", "pending", "return_shipped", "replacement_approved"]) {
    assert.doesNotMatch(describeDigestStatus(status), /_/, status);
  }
  assert.equal(describeDigestStatus("something_new"), "waiting");
});

test("rendered, the sections appear as a headed list in text and html, escaped", () => {
  const parts = adminDigestParts(input({ waitingOnAdmin: [line("<b>RJ</b>", 3)] }));
  const mail = renderEmail(parts, "https://shop.test/admin/returns", ADMIN_DIGEST_FOOTER);
  assert.match(mail.text, /Waiting on you \(over 2 days\)\n- Order <b>RJ<\/b>: needs your decision \(3 days\)/);
  assert.match(mail.html, /<ul style="margin-top:0"><li>Order &lt;b&gt;RJ&lt;\/b&gt;/);
  assert.doesNotMatch(mail.html, /<li>Order <b>/);
  assert.match(mail.text, /Open returns: https:\/\/shop\.test\/admin\/returns/);
  assert.match(mail.text, /only sent on a day when a return is running late/);
});

test("an email without sections renders exactly as before", () => {
  const mail = renderEmail({ subject: "s", intro: "i", detail: "d", cta: "Go" }, "https://x.test", "foot");
  assert.equal(mail.text, "i\n\nd\n\nGo: https://x.test\n\nfoot\n");
  assert.doesNotMatch(mail.html, /<ul/);
});
