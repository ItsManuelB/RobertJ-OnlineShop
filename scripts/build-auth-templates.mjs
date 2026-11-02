/**
 * Renders the Supabase Auth email templates (password reset, signup confirmation, email change)
 * from the same layout as every other email, into supabase/templates/.
 *
 *   NEXT_PUBLIC_SITE_URL=https://robertjshop.store npm run build:email-templates
 *
 * The hosted project does not read that folder by itself: paste each file into
 * Supabase, Authentication, Email Templates (see supabase/templates/README.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ACCOUNT_EMAIL_KINDS, SUPABASE_CONFIRMATION_URL, accountEmailMessage } from "../src/lib/email/account-emails.ts";
import { renderEmail } from "../src/lib/email/layout.ts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (!siteUrl) {
  console.error("Set NEXT_PUBLIC_SITE_URL to the live shop address, e.g. https://robertjshop.store");
  process.exit(1);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "templates");
mkdirSync(outDir, { recursive: true });

const chrome = {
  logoUrl: new URL("/brand/email-logo.png", siteUrl).toString(),
  siteUrl,
  settingsUrl: null,
  canReply: false,
};

for (const kind of ACCOUNT_EMAIL_KINDS) {
  const message = accountEmailMessage(kind, SUPABASE_CONFIRMATION_URL);
  const { html } = renderEmail(message, chrome);
  writeFileSync(join(outDir, `${kind}.html`), html);
  console.log(`${kind}.html  subject: ${message.subject}`);
}
