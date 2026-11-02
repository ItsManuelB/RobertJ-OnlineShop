"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { updateOwnShopNameAction } from "@/features/shops/actions/shop.actions";
import type { Shop } from "@/features/shops/types/shop.types";
import type { ActionResult } from "@/types/action.types";

const inputClasses =
  "rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Matches the `shops_name_length` CHECK constraint and `update_own_shop_name`'s own bound. */
const MAX_NAME_LENGTH = 80;

export interface ShopNameFormProps {
  shop: Shop;
  /** Mirrors the in-progress text (e.g. a live buyer preview). */
  onNameChange?: (name: string) => void;
}

/**
 * Name-only — any member of the shop can rename it (the same permission tier
 * `ShopBrandingForm`'s description already uses; `active`/`slug` stay
 * admin-only). Mirrors `ShopBrandingForm`'s dirty/save-bar pattern exactly so
 * the two forms behave identically.
 */
export function ShopNameForm({ shop, onNameChange }: ShopNameFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<Shop> | null, FormData>(
    updateOwnShopNameAction,
    null,
  );
  const [name, setName] = useState(shop.name);
  // The last persisted text — the form is "dirty" (and the save bar shows)
  // only while `name` differs from it.
  const [savedName, setSavedName] = useState(shop.name);
  const [justSaved, setJustSaved] = useState(false);
  // Tracks the last `state` this component has reacted to, so a successful
  // save can adjust `name`/`justSaved` during render (React's recommended
  // alternative to a `useEffect` here — see "You Might Not Need an Effect")
  // instead of calling setState inside an effect body.
  const [handledState, setHandledState] = useState(state);

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  if (state !== handledState) {
    setHandledState(state);
    if (state?.success) {
      const persisted = state.data.name;
      setName(persisted);
      setSavedName(persisted);
      onNameChange?.(persisted);
      setJustSaved(true);
    }
  }

  const trimmed = name.trim();
  const isDirty = name !== savedName;

  function updateName(next: string) {
    setName(next);
    setJustSaved(false);
    onNameChange?.(next);
  }

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex flex-col gap-2">
      {formError ? <ErrorState title="Couldn't rename your shop" message={formError} /> : null}

      <label htmlFor="shop-name" className="text-sm font-medium">
        Shop name
      </label>
      <input
        id="shop-name"
        name="name"
        type="text"
        value={name}
        onChange={(event) => updateName(event.target.value)}
        maxLength={MAX_NAME_LENGTH}
        placeholder="Your shop's name"
        className={inputClasses}
      />
      <div className="flex items-center justify-between">
        {fieldErrors?.name ? (
          <p className="text-xs text-danger" role="alert">
            {fieldErrors.name[0]}
          </p>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted-foreground">
          {name.length}/{MAX_NAME_LENGTH}
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
          <span>{isPending ? "Saving your shop name…" : "You have unsaved changes to the shop name."}</span>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => updateName(savedName)}
              className="flex-1 border-background/40 bg-transparent text-background hover:bg-background/10 sm:flex-none"
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isPending}
              disabled={trimmed.length === 0}
              className="flex-1 sm:flex-none"
            >
              {isPending ? "Saving…" : "Save name"}
            </Button>
          </span>
        </div>
      ) : null}
    </form>
  );
}
