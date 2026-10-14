"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  changePasswordSchema,
  linkProviderSchema,
  unlinkProviderSchema,
  updateBuyerPreferencesSchema,
  updateProfileSchema,
  uploadAvatarSchema,
} from "@/features/account/schemas/account.schema";
import { buildExport, type MyDataExport } from "@/features/account/lib/export-my-data";
import type { BuyerPreferences, Profile } from "@/features/account/types/account.types";

/** Updates the signed-in user's own profile row. RLS restricts the write to own row. */
export async function updateProfileAction(
  _prevState: ActionResult<Profile> | null,
  formData: FormData,
): Promise<ActionResult<Profile>> {
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`updateProfile:${user.id}`, 5, 60);
    const profile = await queries.updateMyProfile(user.id, parsed.data);
    // Re-render the profile page and the shared header/identity surfaces.
    revalidatePath(ROUTES.profile, "layout");
    revalidatePath("/", "layout");
    return ok(profile);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not update your profile.",
    );
  }
}

/** Uploads a new profile picture and returns its public URL. RLS + the `avatars` bucket's own-folder policy restrict the write to the caller's own path. */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<ActionResult<string>> {
  const parsed = uploadAvatarSchema.safeParse({ image: formData.get("image") });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`uploadAvatar:${user.id}`, 10, 300);
    const url = await queries.uploadAvatar(user.id, parsed.data.image);
    revalidatePath(ROUTES.profile, "layout");
    revalidatePath("/", "layout");
    return ok(url);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not upload the image.");
  }
}

/** Removes the signed-in user's profile picture. */
export async function removeAvatarAction(): Promise<ActionResult<null>> {
  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`uploadAvatar:${user.id}`, 10, 300);
    await queries.removeAvatar(user.id);
    revalidatePath(ROUTES.profile, "layout");
    revalidatePath("/", "layout");
    return ok(null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not remove the image.");
  }
}

/**
 * Manually links a Google/Facebook identity to the signed-in user (Connected
 * Accounts panel, `/privacy`). This is the sanctioned fallback for the case
 * automatic linking can't safely handle — e.g. Facebook without a
 * provider-verified email — and is safe specifically because the caller is
 * already an authenticated, proven owner of this account. Bound directly to
 * `<form action={...}>` (plain `void | Promise<void>` DOM form action, not
 * `useActionState`) — success is a full navigation to the provider's consent
 * screen. Failures redirect back to `/privacy?error=<code>` rather than
 * returning an `ActionResult`, which a plain form action never reads; the
 * privacy page maps that code via `mapOAuthCallbackError`, same as sign-in.
 */
export async function linkIdentityAction(formData: FormData): Promise<void> {
  const parsed = linkProviderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`${ROUTES.privacy}?error=oauth_start_failed`);
  }

  let url: string;
  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`link:${user.id}`, 10, 300);
    url = await queries.linkOAuthIdentity(parsed.data.provider, ROUTES.privacy);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /too many attempts/i.test(message) ? "rate_limited" : "oauth_start_failed";
    redirect(`${ROUTES.privacy}?error=${code}`);
  }

  redirect(url);
}

/** Disconnects a linked identity. Refuses to remove the caller's last remaining identity. */
export async function unlinkIdentityAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = unlinkProviderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`unlink:${user.id}`, 10, 300);
    const identities = await queries.listUserIdentities();
    const identity = identities.find((i) => i.identity_id === parsed.data.identityId);
    if (!identity) {
      return fail("That connected account could not be found.");
    }
    if (identities.length < 2) {
      return fail("You need at least one other way to sign in before disconnecting this one.");
    }
    await queries.unlinkOAuthIdentity(identity);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not disconnect that account.",
    );
  }

  revalidatePath(ROUTES.privacy, "layout");
  return ok(null);
}

/**
 * Changes the signed-in user's password. Requires their *current* password,
 * re-verified via `queries.reauthenticateWithPassword` (there is no separate
 * "verify password" API — this is the same grant Supabase uses to prove
 * identity) before `queries.updatePassword` sets the new one and revokes
 * every other session on the account, same as the recovery-flow password
 * update. Deliberately a new action rather than reusing
 * `updatePasswordAction` — that one is gated on an active *recovery*
 * session (`requireRecoverySession`), which a normal signed-in session is
 * not and must not be made to satisfy.
 */
export async function changePasswordAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`changePassword:${user.id}`, 5, 300);

    try {
      await queries.reauthenticateWithPassword(
        user.email,
        parsed.data.currentPassword,
        parsed.data.captchaToken,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Only a genuine credential failure means "wrong password" — a captcha
      // or rate-limit failure must not be reported as one.
      if (/captcha/i.test(message)) {
        return fail("Verification failed. Please try again.", {
          captchaToken: ["Verification failed. Please try again."],
        });
      }
      if (/invalid login credentials/i.test(message)) {
        return fail("Your current password is incorrect.", {
          currentPassword: ["Incorrect password."],
        });
      }
      return fail("We couldn't verify your password right now. Please try again in a moment.");
    }

    await queries.updatePassword(parsed.data.password);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not update your password.",
    );
  }

  return ok(null);
}

/**
 * Saves one or more Privacy & Settings preferences. Called once per toggle/
 * radio change (not one big form submit) — `input` only carries the field
 * that changed, and `queries.updateMyBuyerPreferences`'s partial upsert
 * leaves everything else untouched. Revalidates `/notifications` too since
 * `orderUpdates` gates whether that page's activity feed renders.
 */
export async function updateBuyerPreferencesAction(
  input: unknown,
): Promise<ActionResult<BuyerPreferences>> {
  const parsed = updateBuyerPreferencesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`updatePreferences:${user.id}`, 30, 60);
    const preferences = await queries.updateMyBuyerPreferences(user.id, parsed.data);
    revalidatePath(ROUTES.privacy, "layout");
    revalidatePath(ROUTES.notifications, "layout");
    return ok(preferences);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not save your preferences.",
    );
  }
}

/**
 * Deactivates the signed-in buyer's own account (`self_deactivate_account`
 * RPC), then signs them out and redirects to sign-in — mirroring
 * `signOutAction`'s exact sign-out/redirect shape. On failure (e.g. a
 * seller/admin somehow reaching this, or an already-inactive account)
 * returns a friendly error instead of redirecting, so the confirmation
 * panel that called this can display it inline.
 */
export async function deactivateAccountAction(): Promise<ActionResult<null>> {
  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`deactivateAccount:${user.id}`, 3, 300);
    await queries.selfDeactivateAccount();
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not deactivate your account.",
    );
  }

  await queries.signOut();
  revalidatePath("/", "layout");
  redirect(ROUTES.signIn);
}

/** Orders are fetched in pages of this size when building the data export. */
const EXPORT_ORDER_PAGE_SIZE = 100;
/** Upper bound so a pathological account can't make one export unbounded. */
const EXPORT_ORDER_MAX_PAGES = 20;

/**
 * "Download my data": returns the signed-in buyer's own profile, preferences,
 * addresses, orders and wishlist size as a plain object the client saves as a
 * file. Everything is read through the caller's own session (RLS-scoped), and
 * `buildExport` allow-lists the fields so no internal ids leave the system.
 */
export async function exportMyDataAction(): Promise<ActionResult<MyDataExport>> {
  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`exportMyData:${user.id}`, 3, 600);

    const [profile, preferences, addresses, wishlist] = await Promise.all([
      queries.getMyProfile(),
      queries.getMyBuyerPreferences(user.id),
      queries.listMyAddresses(user.id),
      queries.listWishlistProductIds(user.id),
    ]);

    const orders = [];
    for (let page = 1; page <= EXPORT_ORDER_MAX_PAGES; page += 1) {
      const result = await queries.listBuyerOrders(user.id, {
        page,
        pageSize: EXPORT_ORDER_PAGE_SIZE,
      });
      orders.push(...result.items);
      if (page >= result.totalPages) break;
    }

    return ok(
      buildExport({
        email: user.email,
        profile,
        preferences,
        addresses,
        orders,
        wishlistCount: wishlist.length,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not prepare your data.");
  }
}

/** Ends every other login of the signed-in user; the current device stays signed in. */
export async function signOutOtherDevicesAction(): Promise<ActionResult<null>> {
  try {
    const user = await queries.requireSessionUser();
    await queries.requireRateLimit(`signOutOthers:${user.id}`, 5, 300);
    await queries.signOutOtherSessions();
    return ok(null);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not sign out your other devices.",
    );
  }
}
