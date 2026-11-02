"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { useScrollLock } from "@/hooks/useScrollLock";
import { cn } from "@/lib/utils/cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Right-side slide-in panel for single-row detail/edit — replaces expanding
 * a table row's content in place, so opening one row doesn't push the rest
 * of the list down. Same hand-rolled dialog shape `ProductFilters`' mobile
 * sheet already uses (backdrop + `role="dialog"` panel + Escape-to-close),
 * not a new pattern.
 */
export function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Lock background scroll while the drawer is open — same pattern as
  // ProductLightbox/ProductFilters.
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    // Return focus to whatever opened the drawer once it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col",
          "border-l border-border bg-card shadow-2xl outline-none",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="truncate text-sm font-bold text-foreground">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap gap-2 border-t border-border p-4">{footer}</div>
        ) : null}
      </div>
    </>
  );
}
