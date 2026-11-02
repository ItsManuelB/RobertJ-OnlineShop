// Types only on purpose: used by a Node script and unit-tested with plain Node, which can't resolve the `@/` alias or sibling value imports.
import type { EmailMessage } from "./layout";

/** The account emails Supabase Auth sends. Each becomes one file in `supabase/templates/`. */
export const ACCOUNT_EMAIL_KINDS = ["recovery", "confirmation", "email_change"] as const;
export type AccountEmailKind = (typeof ACCOUNT_EMAIL_KINDS)[number];

/** The link Supabase fills in when it sends the email. Kept as its own placeholder text in the template. */
export const SUPABASE_CONFIRMATION_URL = "{{ .ConfirmationURL }}";

/** The words of one account email. Pure: the caller supplies the link (Supabase's placeholder for a template). */
export function accountEmailMessage(kind: AccountEmailKind, url: string): EmailMessage {
  switch (kind) {
    case "recovery":
      return {
        subject: "Reset your password",
        preheader: "Use this link to choose a new password.",
        badge: { label: "Account security", tone: "brand" },
        headline: "Reset your password",
        paragraphs: [
          "We received a request to reset your password. The link works once and expires soon.",
          "If you didn't ask for this, you can ignore this email and your password stays the same.",
        ],
        cta: { label: "Choose a new password", url },
        reason: "You get this because a password reset was requested for your account.",
      };
    case "confirmation":
      return {
        subject: "Confirm your email address",
        preheader: "One tap to finish creating your account.",
        badge: { label: "Welcome", tone: "brand" },
        headline: "Confirm your email address",
        paragraphs: [
          "Thanks for signing up. Confirm your email address to finish creating your account.",
          "If you didn't sign up, you can ignore this email.",
        ],
        cta: { label: "Confirm my email", url },
        reason: "You get this because this address was used to create an account.",
      };
    case "email_change":
      return {
        subject: "Confirm your new email address",
        preheader: "Confirm the change to keep your account secure.",
        badge: { label: "Account security", tone: "brand" },
        headline: "Confirm your new email address",
        paragraphs: [
          "We received a request to change the email address on your account. Confirm it to finish the change.",
          "If you didn't ask for this, ignore this email and sign in to check your account.",
        ],
        cta: { label: "Confirm new email", url },
        reason: "You get this because a change of email address was requested for your account.",
      };
  }
}
