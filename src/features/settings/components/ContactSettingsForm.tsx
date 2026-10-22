"use client";

import { useActionState } from "react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { updatePlatformSettingsAction } from "@/features/settings/actions/settings.actions";
import type { PlatformSettings } from "@/features/settings/types/settings.types";
import type { ActionResult } from "@/types/action.types";

export interface ContactSettingsFormProps {
  settings: PlatformSettings;
}

/** Storefront support contact (shown in the public footer). */
export function ContactSettingsForm({ settings }: ContactSettingsFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<PlatformSettings> | null, FormData>(
    updatePlatformSettingsAction,
    null,
  );
  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex max-w-md flex-col gap-4">
      {formError ? <ErrorState title="Couldn't save the settings" message={formError} /> : null}
      {state?.success ? (
        <p role="status" aria-live="polite" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          Settings saved.
        </p>
      ) : null}
      <FormField
        label="Support email"
        name="supportEmail"
        type="email"
        defaultValue={settings.supportEmail}
        required
        errors={fieldErrors?.supportEmail}
        themed
      />
      <FormField
        label="Support phone"
        name="supportPhone"
        type="tel"
        inputMode="tel"
        defaultValue={settings.supportPhone ?? ""}
        hint="Optional."
        errors={fieldErrors?.supportPhone}
        themed
      />
      <FormField
        label="Business address"
        name="businessAddress"
        defaultValue={settings.businessAddress ?? ""}
        autoComplete="street-address"
        hint="Optional. Shown in the storefront footer."
        errors={fieldErrors?.businessAddress}
        themed
      />
      <FormField
        label="Business hours"
        name="businessHours"
        defaultValue={settings.businessHours ?? ""}
        hint="Optional, e.g. Mon–Sat, 9:00 AM – 6:00 PM."
        errors={fieldErrors?.businessHours}
        themed
      />
      <Button type="submit" isLoading={isPending} className="w-full sm:w-auto sm:self-start">
        Save changes
      </Button>
    </form>
  );
}
