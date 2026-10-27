"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { setDefaultAddressAction } from "@/features/addresses/actions/address.actions";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { addressSchema, type AddressInput } from "@/features/addresses/schemas/address.schema";
import type { Address } from "@/features/addresses/types/address.types";
import type { ActionResult } from "@/types/action.types";
import { useScrollLock } from "@/hooks/useScrollLock";

type FieldErrors = Record<string, string[] | undefined>;

export interface AddressModalProps {
  /** "New Address" (add) or "Edit Address" (edit) — the only difference between the two call sites. */
  title: string;
  initialValues: AddressInput;
  /** Hides the "Set as Default Address" checkbox — used when editing an address that's already the default (nothing meaningful to toggle). */
  isAlreadyDefault?: boolean;
  onCancel: () => void;
  /** Either `createAddressAction` or `updateAddressAction` (already bound to the address id by the caller). */
  onSubmit: (input: AddressInput) => Promise<ActionResult<Address>>;
}

/**
 * Centered add/edit address dialog, shared by `AddressList`'s "+ Add
 * Address" and `AddressCard`'s "Edit" — one modal shell + submit flow
 * instead of two. Focus-trap/Escape/backdrop-click handling mirrors the
 * established full-screen dialog pattern already used elsewhere
 * (`ProductLightbox`, `GuidedSelectorQuiz`), just as a centered card instead
 * of a full-bleed overlay — an address form is much shorter.
 *
 * Validation and persistence are unchanged: `addressSchema` and whichever
 * Server Action the caller passes in (`createAddressAction`/
 * `updateAddressAction`) are the exact same ones the page already used
 * before this was a modal. On success the caller closes the modal; the
 * action's own `revalidatePath(ROUTES.addresses)` refreshes the list.
 *
 * "Set as Default Address" is deliberately not part of `addressSchema`/
 * `onSubmit` — `setDefaultAddressAction` stays the sole dedicated path for
 * changing which address is default (see the schema's own header comment).
 * Checking the box just chains that same action, best-effort, right after a
 * successful save; a failure there never blocks the modal from closing,
 * since the address itself was already saved correctly.
 */
export function AddressModal({
  title,
  initialValues,
  isAlreadyDefault = false,
  onCancel,
  onSubmit,
}: AddressModalProps) {
  useScrollLock(true); // mounted only while open
  const [values, setValues] = useState<AddressInput>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [isPending, startTransition] = useTransition();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
  }, []);

  function handleCancel() {
    previousFocusRef.current?.focus();
    onCancel();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleCancel();
        return;
      }
      if (event.key === "Tab") {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(field: keyof AddressInput, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  function handleSubmit() {
    // Belt-and-suspenders alongside the Save button's own isLoading-disabled
    // state — a keyboard Enter can't race a second submit in while pending.
    if (isPending) return;

    setFormError(null);
    const parsed = addressSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await onSubmit(parsed.data);
      if (!result.success) {
        setFormError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      if (setAsDefault) {
        await setDefaultAddressAction(result.data.id).catch(() => {});
      }
      // On success the caller (AddressList/AddressCard) closes the modal.
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-rj-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleCancel();
      }}
    >
      <div
        ref={panelRef}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-rj-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-rj-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-rj-black">{title}</h2>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={handleCancel}
            aria-label={`Close ${title}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rj-gray-500 transition-colors hover:bg-rj-gray-100 hover:text-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AddressForm values={values} errors={fieldErrors} onChange={handleChange} />

          {!isAlreadyDefault ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-rj-gray-700">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(event) => setSetAsDefault(event.target.checked)}
                className="h-4 w-4 shrink-0 accent-rj-red"
              />
              Set as Default Address
            </label>
          ) : null}

          {formError ? (
            <p className="mt-3 text-xs font-semibold text-danger" role="alert">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-rj-gray-100 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="rjSm"
            disabled={isPending}
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button type="button" variant="rj" size="rjSm" isLoading={isPending} onClick={handleSubmit}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
