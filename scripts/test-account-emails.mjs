/**
 * Unit tests for the Supabase Auth email wording and its rendering through the shared layout.
 *
 *   node --experimental-strip-types --no-warnings --test scripts/test-account-emails.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ACCOUNT_EMAIL_KINDS, SUPABASE_CONFIRMATION_URL, accountEmailMessage } from "../src/lib/email/account-emails.ts";
import { renderEmail } from "../src/lib/email/layout.ts";

const chrome = { logoUrl: "https://shop.test/brand/email-logo.png", siteUrl: "https://shop.test", settingsUrl: null, canReply: false };

test("every account email has a short subject, a clear action and a reason", () => {
  for (const kind of ACCOUNT_EMAIL_KINDS) {
    const message = accountEmailMessage(kind, SUPABASE_CONFIRMATION_URL);
    assert.ok(message.subject.length > 0 && message.subject.length <= 60, kind);
    assert.ok(message.cta.label.length > 0 && message.reason.length > 0, kind);
    assert.doesNotMatch(JSON.stringify(message), /undefined|null/, kind);
  }
});

test("the reset email says what to do if the person did not ask for it", () => {
  const message = accountEmailMessage("recovery", SUPABASE_CONFIRMATION_URL);
  assert.equal(message.subject, "Reset your password");
  assert.match(message.paragraphs.join(" "), /didn't ask for this/);
});

test("rendered, the template keeps Supabase's link placeholder for both the button and the printed link", () => {
  for (const kind of ACCOUNT_EMAIL_KINDS) {
    const { html } = renderEmail(accountEmailMessage(kind, SUPABASE_CONFIRMATION_URL), chrome);
    assert.equal(html.split('href="{{ .ConfirmationURL }}"').length - 1, 2, kind);
    assert.match(html, /<meta name="viewport"/);
    // Nothing else may look like template syntax, or Supabase would try to fill it in:
    // the button's link, the printed link's address, and the printed link's text.
    assert.equal(html.split("{{").length - 1, 3, kind);
  }
});
