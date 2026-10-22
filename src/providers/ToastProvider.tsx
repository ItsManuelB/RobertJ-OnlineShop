"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export interface ToastInput {
  message: string;
  tone?: "success" | "error";
  /** Optional link shown inside the toast, e.g. "View cart". */
  action?: { label: string; href: string };
  /** Optional button that reverses what the toast reports, e.g. "Undo" after an accidental add. */
  undo?: { label: string; onClick: () => void };
}

interface ToastValue {
  showToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const AUTO_DISMISS_MS = 4500;

/**
 * App-wide notifications. One toast at a time (a new one replaces the old),
 * announced through a live region, auto-dismissed, and dismissible by button.
 * Errors use `role="alert"` so they interrupt; successes are polite.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const counter = useRef(0);

  const showToast = useCallback((input: ToastInput) => {
    counter.current += 1;
    setToast({ ...input, id: counter.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const isError = toast?.tone === "error";

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4 sm:bottom-6">
        {toast ? (
          <div
            key={toast.id}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",
              isError
                ? "border-danger/40 bg-card text-foreground"
                : "border-border bg-card text-foreground",
            )}
          >
            {isError ? (
              <XCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 break-words">{toast.message}</span>
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.onClick();
                  setToast(null);
                }}
                className="shrink-0 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {toast.undo.label}
              </button>
            ) : null}
            {toast.action ? (
              <Link
                href={toast.action.href}
                onClick={() => setToast(null)}
                className="shrink-0 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {toast.action.label}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

/** Shows a toast. A no-op outside the provider so isolated components still render. */
export function useToast(): ToastValue {
  return useContext(ToastContext) ?? { showToast: () => undefined };
}
