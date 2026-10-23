"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_ONLY_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import {
  updateDefaultLowStockThresholdSchema,
  updatePlatformSettingsSchema,
} from "@/features/settings/schemas/settings.schema";
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
    businessAddress: formData.get("businessAddress") ?? "",
    businessHours: formData.get("businessHours") ?? "",
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

/** Saves the inherited low-stock threshold; the RPC applies it to inheriting inventory rows and logs the change. */
export async function updateDefaultLowStockThresholdAction(
  _prev: ActionResult<PlatformSettings> | null,
  formData: FormData,
): Promise<ActionResult<PlatformSettings>> {
  const parsed = updateDefaultLowStockThresholdSchema.safeParse({ threshold: formData.get("threshold") });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const admin = await queries.requireRole(ADMIN_ONLY_ROLES);
    await queries.requireRateLimit(`updateDefaultLowStockThreshold:${admin.id}`, 20, 60);
    const settings = await queries.updateDefaultLowStockThreshold(parsed.data.threshold);
    revalidatePath(ROUTES.adminSettings);
    revalidatePath(ROUTES.adminInventory);
    revalidatePath(ROUTES.sellerInventory);
    revalidatePath(ROUTES.adminReports);
    revalidatePath(ROUTES.sellerReports);
    revalidatePath(ROUTES.adminDashboard);
    revalidatePath(ROUTES.sellerDashboard);
    revalidatePath(ROUTES.admin, "layout");
    revalidatePath(ROUTES.seller, "layout");
    revalidatePath(ROUTES.adminAuditLog);
    return ok(settings);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save the threshold.");
  }
}
