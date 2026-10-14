"use client";

import { useActionState } from "react";

import { Turnstile } from "@/components/Turnstile";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/features/auth";
import { changePasswordAction } from "@/features/account/actions/account.actions";
import { useTurnstileToken } from "@/hooks/useTurnstileToken";
import { cn } from "@/lib/utils/cn";
import type { ActionResult } from "@/types/action.types";

export interface ChangePasswordFormProps {
  /** Portal surfaces (seller): uses the theme tokens so it inverts correctly in dark mode. Buyer surfaces omit it. */
  themed?: boolean;
  /**
   * Whether the account has a password at all. Accounts that only sign in with
   * Google/Facebook have none to change, so the form is replaced by guidance.
   */
  hasPassword?: boolean;
}

/**
 * Change-password form — requires the current password (re-verified
 * server-side, see `changePasswordAction`) before accepting a new one, plus a
 * Turnstile token because that re-check signs in through Supabase Auth, which
 * enforces captcha. Separate from `ResetPasswordForm`/`updatePasswordAction`:
 * that flow only works inside a password-recovery session, not a normal
 * signed-in one. Shared by the buyer (`/change-password`) and the seller
 * (`/seller/settings`) pages.
 */
export function ChangePasswordForm({ themed = false, hasPassword = true }: ChangePasswordFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    changePasswordAction,
    null,
  );
  const captcha = useTurnstileToken(state);

  if (!hasPassword) {
    return (
      <p className={cn("max-w-xl text-sm", themed ? "text-muted-foreground" : "text-rj-gray-600")}>
        You sign in with Google or Facebook, so there is no password to change. To sign in with a password as
        well, sign out, then use <span className="font-medium">Forgot password</span> on the sign-in page to
        create one.
      </p>
    );
  }

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError =
    state && !state.success && (!state.fieldErrors || fieldErrors?.captchaToken) ? state.error : undefined;

  const field = (props: {
    label: string;
    name: string;
    autoComplete: string;
    hint?: string;
    errors?: string[];
  }) =>
    themed ? (
      <FormField {...props} type="password" required themed />
    ) : (
      <PasswordInput {...props} required />
    );

  return (
    <form
      key={captcha.successCount}
      action={formAction}
      noValidate
      aria-busy={isPending}
      className="flex max-w-xl flex-col gap-5"
    >
      {formError ? <ErrorState title="Couldn't update your password" message={formError} /> : null}
      {state?.success ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "text-sm font-medium",
            themed
              ? "rounded-md border border-success/30 bg-success/10 px-3 py-2 text-success"
              : "rounded-2xl border border-rj-green/30 bg-rj-green/5 p-4 text-rj-green",
          )}
        >
          Your password has been changed.
        </div>
      ) : null}

      {field({ label: "Current password", name: "currentPassword", autoComplete: "current-password", errors: fieldErrors?.currentPassword })}
      {field({ label: "New password", name: "password", autoComplete: "new-password", hint: "Must be at least 10 characters", errors: fieldErrors?.password })}
      {field({ label: "Confirm new password", name: "confirmPassword", autoComplete: "new-password", errors: fieldErrors?.confirmPassword })}

      <Turnstile key={captcha.widgetKey} onVerify={captcha.setToken} />
      <input type="hidden" name="captchaToken" value={captcha.token} />

      <Button
        type="submit"
        variant={themed ? "primary" : "rj"}
        size={themed ? "md" : "rj"}
        isLoading={isPending}
        disabled={!captcha.token}
        className="w-full sm:w-auto sm:self-start"
      >
        {isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
