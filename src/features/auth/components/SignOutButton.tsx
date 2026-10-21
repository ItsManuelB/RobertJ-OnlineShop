"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { useScrollLock } from "@/hooks/useScrollLock";
import { signOutAction } from "@/features/auth/actions/auth.actions";

export interface SignOutButtonProps {
  /** Exact classNames each call site already used on its trigger button — kept as-is so every sidebar/topbar/menu looks identical to before. */
  className: string;
  children: ReactNode;
  /** Wraps just the trigger button (e.g. a dropdown item's border-top divider) — the confirm dialog itself is portaled out, so this never wraps it. */
  wrapperClassName?: string;
  /** Adds the Admin/Seller theme scope to the portaled confirmation surface. */
  themeScope?: "admin" | "seller";
}

/**
 * Shared sign-out trigger, used by every sidebar/topbar/account menu so a
 * stray click can't end the session — a second, explicit confirm is always
 * required. The confirm dialog is a centered, viewport-level modal (same
 * backdrop + centered-card shape as `AddressModal`), portaled to
 * `document.body`: several call sites (AccountMenu, SellerTopbar,
 * AdminTopbar) render this inside an `overflow-hidden` dropdown panel, which
 * would otherwise clip a `fixed` dialog instead of letting it center on the
 * full viewport. `stopPropagation` on the overlay keeps the dialog's own
 * clicks from reaching those dropdowns' document-level "click outside"
 * listeners — without it, opening the dialog from inside a dropdown would
 * immediately read as an outside click and close (unmount) the dropdown,
 * taking this dialog down with it.
 */
export function SignOutButton({ className, children, wrapperClassName, themeScope }: SignOutButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(confirmOpen);

  useEffect(() => {
    if (!confirmOpen) return;
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmOpen]);

  function handleCancel() {
    setConfirmOpen(false);
    triggerRef.current?.focus();
  }

  function handleConfirm() {
    startTransition(() => {
      // signOutAction always ends in redirect() — nothing to await/check here.
      void signOutAction();
    });
  }

  return (
    <>
      <div className={wrapperClassName}>
        <button type="button" ref={triggerRef} className={className} onClick={() => setConfirmOpen(true)}>
          {children}
        </button>
      </div>

      {confirmOpen
        ? createPortal(
            <div
              data-theme-scope={themeScope}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-rj-black/50 p-4"
              onMouseDown={(event) => {
                // Stops a dropdown ancestor's own document-level "click
                // outside" listener from ever seeing this click — see the
                // component doc comment above.
                event.stopPropagation();
                if (event.target === event.currentTarget) handleCancel();
              }}
            >
              <div
                ref={panelRef}
                role="alertdialog"
                aria-modal="true"
                aria-label="Sign out of your account"
                tabIndex={-1}
                className={`w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl outline-none ${themeScope ? "bg-rj-white text-rj-black dark:bg-card dark:text-card-foreground" : "bg-rj-white text-rj-black"}`}
              >
                <p className={`text-base font-bold ${themeScope ? "text-foreground" : "text-rj-black"}`}>Sign out?</p>
                <p className={`mt-1.5 text-sm ${themeScope ? "text-muted-foreground" : "text-rj-gray-600"}`}>
                  You&apos;ll need to sign in again to continue.
                </p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="rjSm"
                    disabled={isPending}
                    onClick={handleCancel}
                    className="flex-1"
                  >
                    Stay signed in
                  </Button>
                  <Button
                    type="button"
                    variant={themeScope ? "primary" : "rj"}
                    size="rjSm"
                    isLoading={isPending}
                    onClick={handleConfirm}
                    className="flex-1"
                  >
                    {isPending ? "Signing out…" : "Sign out"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
