import { z } from "zod";

/**
 * Single source of truth for environment variables.
 * Fails fast at module load so misconfiguration never reaches runtime code.
 *
 * The official payment path is COD + Xendit Online Payment (GCash, Maya,
 * Card) — see DECISIONS.md. The Stripe spike (ADR-014) and the QR/manual
 * verification flow (formerly ADR-008) have both been retired.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** Xendit secret API key (test-mode key for this sandbox implementation). Basic-auth username against api.xendit.co. */
  XENDIT_SECRET_KEY: z.string().min(1).optional(),
  /** Compared against the incoming `x-callback-token` webhook header. */
  XENDIT_WEBHOOK_TOKEN: z.string().min(1).optional(),
  /** Compared against the `Authorization: Bearer <secret>` header Vercel Cron sends when this env var is set. Phase 4A passive-reconciliation sweep only — distinct from XENDIT_WEBHOOK_TOKEN (different caller, different trust boundary). */
  CRON_SECRET: z.string().min(1).optional(),
  /** Resend API key for transactional email (return/refund reminders). Optional: with no key, or no EMAIL_FROM, the email sweep does nothing and the app is otherwise unaffected. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** The From header, e.g. `RobertJ Shop <no-reply@your-verified-domain>`. The domain must be verified in Resend. */
  EMAIL_FROM: z.string().min(1).optional(),
  /** Where buyer/seller replies go, e.g. `support@your-verified-domain`. Optional: unset, emails carry no Reply-To. */
  EMAIL_REPLY_TO: z.string().email().optional(),
  /** Resend webhook signing secret (`whsec_...`) for /api/webhooks/resend. Optional: unset, the endpoint answers 503 and nothing is recorded. */
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
});

/**
 * Turns a Zod failure into an actionable setup message. A raw ZodError here
 * is useless — the fix is almost always "create .env.local".
 */
function formatEnvError(error: z.ZodError): never {
  const issues = z
    .flattenError(error)
    .fieldErrors as Record<string, string[] | undefined>;

  const lines = Object.entries(issues).map(([key, messages]) => {
    const detail = messages?.[0] ?? "invalid";
    const isMissing = detail.toLowerCase().includes("undefined");
    return `  - ${key}: ${isMissing ? "missing" : detail}`;
  });

  throw new Error(
    [
      "Invalid environment configuration:",
      ...lines,
      "",
      "Create .env.local from the template and fill in your Supabase values:",
      "  cp .env.example .env.local",
      "",
      "Find the URL and anon key in your Supabase dashboard under",
      "Project Settings → API. Restart the dev server after editing.",
    ].join("\n"),
  );
}

function parsePublicEnv() {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });

  if (!result.success) formatEnvError(result.error);
  return result.data;
}

/** Values safe to reference from Client Components. */
export const publicEnv = parsePublicEnv();

/** Server-only values. Never import this from a Client Component. */
export function getServerEnv() {
  const result = serverEnvSchema.safeParse({
    ...publicEnv,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || undefined,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  });

  if (!result.success) formatEnvError(result.error);
  return result.data;
}

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
