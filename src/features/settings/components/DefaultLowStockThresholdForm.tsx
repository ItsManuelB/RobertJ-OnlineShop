"use client";

import { useActionState } from "react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { updateDefaultLowStockThresholdAction } from "@/features/settings/actions/settings.actions";
import type { PlatformSettings } from "@/features/settings/types/settings.types";
import type { ActionResult } from "@/types/action.types";

export function DefaultLowStockThresholdForm({ settings }: { settings: PlatformSettings }) {
  const [state, formAction, isPending] = useActionState<ActionResult<PlatformSettings> | null, FormData>(
    updateDefaultLowStockThresholdAction,
    null,
  );
  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex max-w-md flex-col gap-3">
      {formError ? <ErrorState title="Couldn't save the threshold" message={formError} /> : null}
      {state?.success ? (
        <p role="status" aria-live="polite" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          Default threshold saved. Inventory using the default has been updated.
        </p>
      ) : null}
      <FormField
        label="Default low-stock threshold"
        name="threshold"
        type="number"
        inputMode="numeric"
        min={0}
        max={10000}
        step={1}
        defaultValue={settings.defaultLowStockThreshold}
        hint="Sellers can set a different threshold for each product or variant."
        errors={fieldErrors?.threshold}
        required
        themed
      />
      <Button type="submit" isLoading={isPending} className="w-full sm:w-auto sm:self-start">
        Save default
      </Button>
    </form>
  );
}
