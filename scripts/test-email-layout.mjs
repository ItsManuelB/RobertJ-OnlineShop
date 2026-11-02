/**
 * Unit tests for the shared email layout: responsive rules, brand colours, escaping and the plain-text twin.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-email-layout.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { EMAIL_COLORS, escapeHtml, renderEmail } from "../src/lib/email/layout.ts";

const chrome = {
  logoUrl: "https://shop.test/brand/email-logo.png",
  siteUrl: "https://shop.test",
  settingsUrl: "https://shop.test/privacy",
  canReply: true,
};

const message = (extra = {}) => ({
  subject: "We received your order RJ-1",
  preheader: "Pay in cash when it arrives.",
  badge: { label: "Order received", tone: "brand" },
  headline: "Thanks for your order",
  paragraphs: ["The seller will confirm it."],
  cta: { label: "View my order", url: "https://shop.test/orders/abc" },
  reason: "You get this because order update emails are on for your account.",
  ...extra,
});

test("the page is a complete, mobile-aware document", () => {
  const { html } = renderEmail(message(), chrome);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>We received your order RJ-1<\/title>/);
});

test("it is fluid up to 600px and tightens on a phone", () => {
  const { html } = renderEmail(message(), chrome);
  // Fluid card: full width, capped at 600px (the width attribute is for Outlook, which ignores max-width).
  assert.match(html, /width="600"[^>]*style="width:100%;max-width:600px/);
  assert.match(html, /@media only screen and \(max-width:480px\)/);
  assert.match(html, /\.px\{padding-left:20px!important;padding-right:20px!important\}/);
  assert.match(html, /\.btn\{width:100%!important\}/);
  // The logo never overflows a narrow screen.
  assert.match(html, /max-width:112px;height:auto/);
});

test("it uses the emerald brand colour and none of the old red", () => {
  const { html } = renderEmail(message(), chrome);
  assert.ok(html.includes(EMAIL_COLORS.brand));
  assert.equal(EMAIL_COLORS.brand, "#135e4a");
  assert.doesNotMatch(html, /#d62828/i);
});

test("the header carries the real logo, with the shop name as its text", () => {
  const { html } = renderEmail(message(), chrome);
  assert.match(html, /<img src="https:\/\/shop\.test\/brand\/email-logo\.png"/);
  assert.match(html, /alt="RobertJ Shop"/);
});

test("the button is a centred table cell, not a padded link, and links to the action", () => {
  const { html } = renderEmail(message(), chrome);
  assert.match(html, /<td class="px" align="center"[^>]*><table role="presentation" class="btn" align="center"/);
  assert.match(html, /<td align="center" bgcolor="#135e4a"[^>]*padding:14px 28px/);
  assert.match(html, /<a href="https:\/\/shop\.test\/orders\/abc"[^>]*>View my order<\/a>/);
  // The address is also printed, for a client that blocks the button.
  assert.match(html, /Copy this link into your browser/);
});

test("the preheader is hidden text and the plain text carries the same facts", () => {
  const { html, text } = renderEmail(message(), chrome);
  assert.match(html, /display:none[^>]*>Pay in cash when it arrives\./);
  assert.match(text, /^RobertJ Shop\b|^ROBERTJ SHOP/);
  assert.match(text, /Thanks for your order/);
  assert.match(text, /View my order: https:\/\/shop\.test\/orders\/abc/);
  assert.doesNotMatch(text, /<[a-z]/i);
});

test("the footer shows the reason, links to settings only when there is a page, and offers replies only when they arrive", () => {
  const full = renderEmail(message(), chrome);
  assert.match(full.html, /You get this because order update emails are on/);
  assert.match(full.html, /href="https:\/\/shop\.test\/privacy"[^>]*>Manage email settings/);
  assert.match(full.html, /Reply to this email/);
  assert.match(full.text, /Manage email settings: https:\/\/shop\.test\/privacy/);
  assert.match(full.html, /shop\.test<\/span>/);

  const bare = renderEmail(message(), { ...chrome, settingsUrl: null, canReply: false });
  assert.doesNotMatch(bare.html, /Manage email settings/);
  assert.doesNotMatch(bare.html, /Reply to this email/);
  assert.doesNotMatch(bare.text, /Manage email settings|Reply to this email/);
});

test("optional blocks appear only when the message has them", () => {
  const plain = renderEmail(message(), chrome).html;
  assert.doesNotMatch(plain, /Ship back by|<ol|&times;/);

  const rich = renderEmail(
    message({
      callout: { label: "Ship back by", text: "Sat, 7 Nov 2026" },
      steps: ["Pack it.", "Ship it."],
      rows: [{ label: "Order", value: "RJ-1" }],
      items: [
        { name: "Linen shirt", detail: "Size M", quantity: 2, amount: "₱1,500.00" },
        { name: "and 3 more items" },
      ],
      totals: [
        { label: "Shipping", value: "₱100.00" },
        { label: "Total", value: "₱1,600.00", strong: true },
      ],
    }),
    chrome,
  );
  assert.match(rich.html, /Ship back by/);
  assert.match(rich.html, /Sat, 7 Nov 2026/);
  assert.match(rich.html, /Size M/);
  assert.match(rich.html, /&times; 2/);
  assert.match(rich.html, /₱1,600\.00/);
  assert.match(rich.text, /Ship back by: Sat, 7 Nov 2026/);
  assert.match(rich.text, /1\. Pack it\.\n2\. Ship it\./);
  assert.match(rich.text, /- Linen shirt \(Size M\) x 2  ₱1,500\.00/);
  assert.match(rich.text, /Total: ₱1,600\.00/);
});

test("section rows show an age pill, and a row with no label is a plain line", () => {
  const { html, text } = renderEmail(
    message({
      sections: [
        {
          heading: "Waiting on you (over 2 days)",
          rows: [
            { label: "RJ-9", text: "Needs your decision", pill: "4 days" },
            { label: "", text: "and 4 more", pill: "" },
          ],
        },
      ],
    }),
    chrome,
  );
  assert.match(html, /<strong[^>]*>RJ-9<\/strong><br>Needs your decision/);
  assert.match(html, />4 days<\/span>/);
  const plainLine = html.split("and 4 more")[0].split("<tr>").at(-1);
  assert.doesNotMatch(plainLine, /<strong/);
  assert.match(text, /Waiting on you \(over 2 days\)\n- RJ-9: Needs your decision \(4 days\)\n- and 4 more\n/);
});

test("everything a message carries is escaped", () => {
  const { html } = renderEmail(
    message({
      headline: "<b>Hi</b>",
      paragraphs: ["a & b"],
      rows: [{ label: "<i>x</i>", value: '"q"' }],
      cta: { label: "Go", url: 'https://x.test/?a="1"&b=2' },
    }),
    { ...chrome, logoUrl: 'https://x.test/l.png?"' },
  );
  assert.doesNotMatch(html, /<b>Hi<\/b>|<i>x<\/i>/);
  assert.match(html, /&lt;b&gt;Hi&lt;\/b&gt;/);
  assert.match(html, /a &amp; b/);
  assert.match(html, /href="https:\/\/x\.test\/\?a=&quot;1&quot;&amp;b=2"/);
  assert.match(html, /l\.png\?&quot;"/);
  assert.equal(escapeHtml(`a&b<c>"d"'e'`), "a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;");
});

test("every inline padding is a valid shorthand (more than four values is silently dropped by browsers)", () => {
  const { html } = renderEmail(
    message({
      callout: { label: "Ship back by", text: "Sat, 7 Nov 2026" },
      steps: ["Pack it."],
      rows: [{ label: "Order", value: "RJ-1" }],
      items: [{ name: "Shirt", quantity: 1, amount: "₱1.00" }],
      totals: [
        { label: "Shipping", value: "₱1.00" },
        { label: "Total", value: "₱2.00", strong: true },
      ],
      sections: [{ heading: "H", rows: [{ label: "RJ-9", text: "t", pill: "4 days" }] }],
    }),
    chrome,
  );
  const values = [...html.matchAll(/padding:([^;"]+)/g)].map((match) => match[1].trim().split(/\s+/));
  assert.ok(values.length > 10);
  for (const tokens of values) assert.ok(tokens.length <= 4, `padding: ${tokens.join(" ")}`);
});

test("a placeholder link, as used in a Supabase template, passes through untouched", () => {
  const { html } = renderEmail(message({ cta: { label: "Go", url: "{{ .ConfirmationURL }}" } }), chrome);
  assert.match(html, /href="\{\{ \.ConfirmationURL \}\}"/);
});
