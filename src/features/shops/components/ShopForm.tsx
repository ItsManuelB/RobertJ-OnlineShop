"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import {
  createShopAction,
  updateShopAction,
} from "@/features/shops/actions/shop.actions";
import type { Shop } from "@/features/shops/types/shop.types";
import type { ActionResult } from "@/types/action.types";

export interface ShopFormProps {
  /** Omit for create mode; pass the shop being edited for edit mode. */
  shop?: Shop;
  onDone?: () => void;
}

/** Shared create/edit shop form — mirrors the product editor's field shape. */
export function ShopForm({ shop, onDone }: ShopFormProps) {
  const isEdit = Boolean(shop);
  const [state, formAction, isPending] = useActionState<
    ActionResult<Shop> | null,
    FormData
  >(isEdit ? updateShopAction : createShopAction, null);

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  useEffect(() => {
    if (state?.success) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex flex-col gap-4">
      {formError ? <ErrorState title="Couldn't save the shop" message={formError} /> : null}

      {shop ? <input type="hidden" name="id" value={shop.id} /> : null}

      <FormField
        name="name"
        label="Shop name"
        defaultValue={shop?.name ?? ""}
        placeholder="e.g. Shop One"
        errors={fieldErrors?.name}
        required
        themed
      />

      <Button type="submit" variant="primary" size="rj" isLoading={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving…" : isEdit ? "Save changes" : "Create shop"}
      </Button>
    </form>
  );
}
