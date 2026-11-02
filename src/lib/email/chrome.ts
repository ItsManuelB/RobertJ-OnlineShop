import "server-only";

import { getServerEnv, publicEnv } from "@/config/env";
import { ROUTES } from "@/constants/routes";
import type { EmailChrome } from "@/lib/email/layout";

/** The logo as served from `public/`: cropped and shrunk for email (the full logo is 2 MB). */
const EMAIL_LOGO_PATH = "/brand/email-logo.png";

/** Which page holds the switch that turns an email off. `null` for an email with no such switch. */
export type EmailSettingsPage = "buyer" | "seller" | null;

const SETTINGS_PATHS = {
  buyer: ROUTES.privacy,
  seller: `${ROUTES.sellerSettings}#alerts`,
} as const;

/** The logo address and footer links shared by every email the app sends. */
export function getEmailChrome(settingsPage: EmailSettingsPage): EmailChrome {
  const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL;
  return {
    logoUrl: new URL(EMAIL_LOGO_PATH, siteUrl).toString(),
    siteUrl,
    settingsUrl: settingsPage ? new URL(SETTINGS_PATHS[settingsPage], siteUrl).toString() : null,
    canReply: Boolean(getServerEnv().EMAIL_REPLY_TO),
  };
}
