"use client";

import { useRef, useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { signOutOtherDevicesAction } from "@/features/account/actions/account.actions";
import { cn } from "@/lib/utils/cn";

/**
 * `/privacy`'s Security section: ends every other login of this account while
 * keeping the current device signed in. Useful after using a shared computer.
 */
export function SignOutOtherDevicesPanel({ themed = false }: { themed?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleConfirm() {
    if (isPending) return;
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await signOutOtherDevicesAction();
      if (result.success) setDone(true);
      else setError(result.error);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className={cn("text-sm font-medium", themed ? "text-foreground" : "text-rj-black")}>
          Sign out of other devices
        </span>
        <span className={cn("text-xs", themed ? "text-muted-foreground" : "text-rj-gray-600")}>
          Ends every other login on your account. This device stays signed in.
        </span>
      </div>

      {confirming ? (
        <ConfirmPanel
          label="Sign out of other devices"
          title="Sign out everywhere else?"
          description="Every other phone, tablet or computer signed in to your account will be signed out. You'll stay signed in here."
          tone="danger"
          confirmLabel="Sign out others"
          pendingLabel="Signing out…"
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
          triggerRef={triggerRef}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={cn(buttonVariants({ variant: "outline", size: "rjSm" }), "self-start")}
          onClick={() => setConfirming(true)}
        >
          Sign out of other devices
        </button>
      )}

      {done ? (
        <p
          className={cn("text-xs font-semibold", themed ? "text-muted-foreground" : "text-rj-gray-600")}
          role="status"
        >
          Done — your other devices have been signed out.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
