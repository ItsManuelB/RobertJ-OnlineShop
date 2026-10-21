"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_ONLY_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { updatePlatformSettingsSchema } from "@/features/settings/schemas/settings.schema";
import type { PlatformSettings } from "@/features/settings/types/settings.types";
import * as queries from "@/lib/supabase/queries";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import type { ActionResult } from "@/types/action.types";

/** Saves the storefront contact settings — admin only; the RPC re-checks and writes the audit row. */
export async function updatePlatformSettingsAction(
  _prev: ActionResult<PlatformSettings> | null,
  formData: FormData,
): Promise<ActionResult<PlatformSettings>> {
  const parsed = updatePlatformSettingsSchema.safeParse({
    supportEmail: formData.get("supportEmail"),
    supportPhone: formData.get("supportPhone") ?? "",
  });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const admin = await queries.requireRole(ADMIN_ONLY_ROLES);
    await queries.requireRateLimit(`updatePlatformSettings:${admin.id}`, 20, 60);
    const settings = await queries.updatePlatformSettings(parsed.data);
    // Footer contact details render on every storefront page.
    revalidatePath("/", "layout");
    revalidatePath(ROUTES.adminAuditLog);
    return ok(settings);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save the settings.");
  }
}
