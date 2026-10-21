"use client";

import { useActionState } from "react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/features/account/actions/account.actions";
import { AvatarUploader } from "@/features/account/components/AvatarUploader";
import type { Profile } from "@/features/account/types/account.types";
import type { ActionResult } from "@/types/action.types";

export interface PortalAccountFormProps {
  profile: Profile;
  email: string;
}

/**
 * Signed-in staff member's own account details (seller or admin portal): photo, display name and phone. Email is read
 * only (it is the sign-in identity). Saves through the same
 * `updateProfileAction` the buyer profile uses, which rewrites every profile
 * field it receives — so the fields this form does not show (username,
 * bio, gender, date of birth) ride along as hidden inputs with their current
 * values, and saving can never blank them.
 */
export function PortalAccountForm({ profile, email }: PortalAccountFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<Profile> | null, FormData>(
    updateProfileAction,
    null,
  );
  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;
  const displayName = profile.fullName ?? email;

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <div className="sm:w-44 sm:shrink-0">
        <AvatarUploader currentUrl={profile.avatarUrl} name={displayName} themed />
      </div>

      <form action={formAction} noValidate aria-busy={isPending} className="flex min-w-0 max-w-md flex-1 flex-col gap-4">
        {formError ? <ErrorState title="Couldn't save your details" message={formError} /> : null}
        {state?.success ? (
          <p role="status" aria-live="polite" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
            Your details were saved.
          </p>
        ) : null}

        <input type="hidden" name="username" value={profile.username ?? ""} />
        <input type="hidden" name="bio" value={profile.bio ?? ""} />
        <input type="hidden" name="gender" value={profile.gender ?? ""} />
        <input type="hidden" name="dateOfBirth" value={profile.dateOfBirth ?? ""} />

        <FormField
          label="Name"
          name="fullName"
          defaultValue={profile.fullName ?? ""}
          autoComplete="name"
          required
          errors={fieldErrors?.fullName}
          themed
        />
        <FormField label="Email" value={email} readOnly disabled hint="Your sign-in email can't be changed here." themed />
        <FormField
          label="Phone number"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={profile.phone ?? ""}
          autoComplete="tel"
          errors={fieldErrors?.phone}
          themed
        />

        <Button type="submit" isLoading={isPending} className="w-full sm:w-auto sm:self-start">
          Save changes
        </Button>
      </form>
    </div>
  );
}
