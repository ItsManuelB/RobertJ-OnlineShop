"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { updateOwnShopDescriptionAction } from "@/features/shops/actions/shop.actions";
import type { Shop } from "@/features/shops/types/shop.types";
import type { ActionResult } from "@/types/action.types";

const textareaClasses =
  "min-h-28 rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Matches the `shops_description_length` CHECK constraint. */
const MAX_DESCRIPTION_LENGTH = 500;

export interface ShopBrandingFormProps {
  shop: Shop;
  /** Mirrors the in-progress text (e.g. a live buyer preview). */
  onDescriptionChange?: (description: string) => void;
}

/** Description-only — name/active/slug/image columns are never part of this
 * form's payload (see `updateOwnShopDescriptionAction`). */
export function ShopBrandingForm({ shop, onDescriptionChange }: ShopBrandingFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<Shop> | null, FormData>(
    updateOwnShopDescriptionAction,
    null,
  );
  const [description, setDescription] = useState(shop.description ?? "");
  // The last persisted text — the form is "dirty" (and the save bar shows)
  // only while `description` differs from it.
  const [savedDescription, setSavedDescription] = useState(shop.description ?? "");
  const [justSaved, setJustSaved] = useState(false);
  // Tracks the last `state` this component has reacted to, so a successful
  // save can adjust `description`/`justSaved` during render (React's
  // recommended alternative to a `useEffect` here — see "You Might Not Need
  // an Effect") instead of calling setState inside an effect body.
  const [handledState, setHandledState] = useState(state);

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  if (state !== handledState) {
    setHandledState(state);
    if (state?.success) {
      const persisted = state.data.description ?? "";
      setDescription(persisted);
      setSavedDescription(persisted);
      onDescriptionChange?.(persisted);
      setJustSaved(true);
    }
  }

  const isDirty = description !== savedDescription;

  function updateDescription(next: string) {
    setDescription(next);
    setJustSaved(false);
    onDescriptionChange?.(next);
  }

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex flex-col gap-2">
      {formError ? <ErrorState title="Couldn't save your shop" message={formError} /> : null}

      <label htmlFor="shop-description" className="text-sm font-medium">
        Description
      </label>
      <textarea
        id="shop-description"
        name="description"
        value={description}
        onChange={(event) => updateDescription(event.target.value)}
        maxLength={MAX_DESCRIPTION_LENGTH}
        placeholder="Tell buyers what your shop is about…"
        className={textareaClasses}
      />
      <div className="flex items-center justify-between">
        {fieldErrors?.description ? (
          <p className="text-xs text-danger" role="alert">
            {fieldErrors.description[0]}
          </p>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted-foreground">
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {justSaved && !isPending && !isDirty ? (
          <span className="text-xs font-medium text-success" role="status">
            Saved
          </span>
        ) : null}
      </div>

      {isDirty || isPending ? (
        <div
          role="status"
          className="sticky bottom-3 z-10 mt-2 flex flex-col gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{isPending ? "Saving your description…" : "You have unsaved changes to the description."}</span>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => updateDescription(savedDescription)}
              className="flex-1 border-background/40 bg-transparent text-background hover:bg-background/10 sm:flex-none"
            >
              Discard
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isPending} className="flex-1 sm:flex-none">
              {isPending ? "Saving…" : "Save description"}
            </Button>
          </span>
        </div>
      ) : null}
    </form>
  );
}
