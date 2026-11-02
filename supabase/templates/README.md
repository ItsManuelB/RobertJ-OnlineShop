# Account email templates

The password-reset, signup-confirmation and email-change emails that Supabase Auth sends. They are generated from the same layout as every other email the shop sends (`src/lib/email/layout.ts`), so the colours, logo and wording stay in one place.

**Do not edit the `.html` files by hand.** Change the words in `src/lib/email/account-emails.ts` or the look in `src/lib/email/layout.ts`, then regenerate:

```bash
NEXT_PUBLIC_SITE_URL=https://robertjshop.store npm run build:email-templates
```

## Applying them

The hosted Supabase project does not read this folder. Paste each file into **Authentication, Email Templates** in the Supabase dashboard, and set the subject to match:

| File | Template in the dashboard | Subject |
|---|---|---|
| `recovery.html` | Reset Password | Reset your password |
| `confirmation.html` | Confirm signup | Confirm your email address |
| `email_change.html` | Change Email Address | Confirm your new email address |

Each file keeps Supabase's own `{{ .ConfirmationURL }}` placeholder, which Supabase fills in when it sends the email. The logo is loaded from `/brand/email-logo.png` on the live site, so deploy that file before pasting the templates.

The reset email says the link "expires soon" rather than naming a time. If you want a time in it, it must match **Authentication, Providers, Email, OTP expiry** in the dashboard.
