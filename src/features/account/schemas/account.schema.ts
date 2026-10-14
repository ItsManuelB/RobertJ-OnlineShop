import { z } from "zod";

import { NEW_PASSWORD_MIN, OAUTH_PROVIDERS } from "@/features/auth";

/**
 * Editable profile fields, mirroring the `profiles` column CHECKs:
 * `full_name` 1–120, `username ^[a-z0-9_]{3,30}$`, `phone ^\+?[0-9 ()-]{7,20}$`,
 * `bio` ≤ 500. Empty strings are valid inputs and are normalised to `null` on
 * write (the columns are nullable). `avatar_url` is deliberately not part of
 * this form — it's managed by its own upload/remove actions (see
 * `uploadAvatarSchema` below), never submitted alongside the rest of the form.
 *
 * `username` changing more than once is rejected server-side by the
 * `profiles_enforce_username_change_once` trigger, not here — this schema
 * only validates format/length, same as before.
 *
 * `dateOfBirth`'s "not in the future" rule is deliberately enforced here
 * (Zod), not as a Postgres CHECK — see the migration's header comment.
 */
export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(120, "Full name must be 120 characters or fewer."),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      "3–30 characters: lowercase letters, numbers, underscores.",
    )
    .or(z.literal(""))
    .default(""),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")
    .or(z.literal(""))
    .default(""),
  gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "Enter a valid date.",
    )
    .refine(
      (value) => value === "" || new Date(`${value}T00:00:00Z`).getTime() <= Date.now(),
      "Date of birth can't be in the future.",
    )
    .default(""),
  bio: z
    .string()
    .trim()
    .max(500, "Bio must be 500 characters or fewer.")
    .default(""),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const MAX_AVATAR_BYTES = 1 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png"];

/** Profile picture upload — mirrors `uploadShopImageSchema`'s shape, sized for a small profile photo rather than a product/shop image. */
export const uploadAvatarSchema = z.object({
  image: z
    .instanceof(File, { message: "An image is required." })
    .refine((file) => file.size > 0, "An image is required.")
    .refine((file) => file.size <= MAX_AVATAR_BYTES, "Image must be 1MB or smaller.")
    .refine(
      (file) => ALLOWED_AVATAR_TYPES.includes(file.type),
      "Image must be a JPEG or PNG file.",
    ),
});

export type UploadAvatarInput = z.infer<typeof uploadAvatarSchema>;

/** Connected Accounts panel — linking a second provider identity to the signed-in user. */
export const linkProviderSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
});

/** Connected Accounts panel — unlinking, keyed by the identity's own id (not the provider name, since a user can only ever have one identity per provider anyway, but the id is what Supabase's API needs). */
export const unlinkProviderSchema = z.object({
  identityId: z.string().min(1),
});

/**
 * Change Password form (`/change-password`) — requires the *current*
 * password (verified server-side via re-authentication, see
 * `changePasswordAction`) before accepting a new one. Reuses
 * `NEW_PASSWORD_MIN` so this never drifts from sign-up/reset's rule.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z
      .string()
      .min(NEW_PASSWORD_MIN, `Password must be at least ${NEW_PASSWORD_MIN} characters.`),
    confirmPassword: z.string(),
    /** Cloudflare Turnstile token — the current-password check signs in through Supabase Auth, which enforces captcha. */
    captchaToken: z.string().min(1, "Verification failed. Please try again."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.password !== data.currentPassword, {
    message: "New password must be different from your current password.",
    path: ["password"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Privacy & Settings' preference toggles + default payment method. Every
 * field is optional so a single-toggle save (the UI's actual usage — one
 * checkbox/radio change at a time) only sends the one field that changed;
 * `updateMyBuyerPreferences`'s partial upsert leaves every other column
 * untouched. `defaultPaymentMethod` mirrors `checkout.types.ts`'s
 * `PaymentMethod` union exactly — never a value checkout can't offer.
 */
export const updateBuyerPreferencesSchema = z.object({
  orderUpdates: z.boolean().optional(),
  promotions: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  defaultPaymentMethod: z.enum(["cod", "xendit"]).nullable().optional(),
});

export type UpdateBuyerPreferencesInput = z.infer<typeof updateBuyerPreferencesSchema>;
