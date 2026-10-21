import { z } from "zod";

/** Mirrors the `platform_settings` CHECK constraints so bad input fails before the RPC. */
export const updatePlatformSettingsSchema = z.object({
  supportEmail: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  supportPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number.")
    .or(z.literal(""))
    .default(""),
});

export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;
