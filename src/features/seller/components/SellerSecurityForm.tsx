"use client";

import { useActionState } from "react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "@/features/account";
import type { ActionResult } from "@/types/action.types";

/**
 * Seller change-password form. Same `changePasswordAction` as the buyer page
 * (current password re-verified server-side, rate limited), on portal theme
 * tokens. The action only reports success, so the fields are cleared by
 * remounting the form on the next successful save via `key`.
 */
export function SellerSecurityForm() {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    changePasswordAction,
    null,
  );
  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  return (
    <form
      key={state?.success ? "saved" : "editing"}
      action={formAction}
      noValidate
      aria-busy={isPending}
      className="flex max-w-md flex-col gap-4"
    >
      {formError ? <ErrorState title="Couldn't update your password" message={formError} /> : null}
      {state?.success ? (
        <p role="status" aria-live="polite" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          Your password has been changed.
        </p>
      ) : null}
      <FormField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required errors={fieldErrors?.currentPassword} themed />
      <FormField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters." errors={fieldErrors?.password} themed />
      <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required errors={fieldErrors?.confirmPassword} themed />
      <Button type="submit" isLoading={isPending} className="w-full sm:w-auto sm:self-start">
        Update password
      </Button>
    </form>
  );
}
