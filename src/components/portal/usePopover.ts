"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open/close state for a topbar dropdown: closes on an outside press or
 * Escape, and Escape hands focus back to the button that opened it.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element;
      // The sign-out confirmation is portaled out of the menu; pressing inside it must not unmount the menu.
      if (target.closest?.('[role="alertdialog"]')) return;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef, triggerRef };
}
