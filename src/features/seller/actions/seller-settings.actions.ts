"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { USER_ROLES } from "@/constants/roles";
import * as queries from "@/lib/supabase/queries";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import type { ActionResult } from "@/types/action.types";

import type { SellerAlertPreferences } from "../utils/seller-tasks";

const updateSellerAlertsSchema = z.object({
  orders: z.boolean().optional(),
  returns: z.boolean().optional(),
  payments: z.boolean().optional(),
  lowStock: z.boolean().optional(),
});

/** Saves the signed-in seller's alert switches, then refreshes everything the task list feeds (dashboard cards, topbar bell). */
export async function updateSellerAlertPreferencesAction(input: unknown): Promise<ActionResult<SellerAlertPreferences>> {
  const parsed = updateSellerAlertsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireRole([USER_ROLES.seller]);
    await queries.requireRateLimit(`updateSellerAlerts:${user.id}`, 30, 60);
    const preferences = await queries.updateMySellerPreferences(user.id, parsed.data);
    revalidatePath(ROUTES.sellerDashboard);
    revalidatePath(ROUTES.sellerSettings);
    revalidatePath("/seller", "layout");
    return ok(preferences);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save your alert settings.");
  }
}

export interface SellerDataExport {
  exportedAt: string;
  account: {
    email: string;
    fullName: string | null;
    username: string | null;
    phone: string | null;
    bio: string | null;
  };
  shop: {
    name: string;
    slug: string;
    active: boolean;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
  } | null;
  alertPreferences: SellerAlertPreferences;
}

/**
 * Builds the seller's "Download my data" file from their own records only: an
 * explicit allow-list (no ids, no payment QR path), like the buyer export.
 */
export async function exportSellerDataAction(): Promise<ActionResult<SellerDataExport>> {
  try {
    const user = await queries.requireRole([USER_ROLES.seller]);
    await queries.requireRateLimit(`exportSellerData:${user.id}`, 3, 600);

    const [profile, shopId, alertPreferences] = await Promise.all([
      queries.getMyProfile(),
      queries.getOwnShopId(user.id),
      queries.getMySellerPreferences(user.id),
    ]);
    const shop = shopId ? await queries.getShopById(shopId) : null;

    return ok({
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        fullName: profile?.fullName ?? null,
        username: profile?.username ?? null,
        phone: profile?.phone ?? null,
        bio: profile?.bio ?? null,
      },
      shop: shop
        ? {
            name: shop.name,
            slug: shop.slug,
            active: shop.active,
            description: shop.description,
            logoUrl: shop.logoUrl,
            bannerUrl: shop.bannerUrl,
          }
        : null,
      alertPreferences,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not prepare your data.");
  }
}
