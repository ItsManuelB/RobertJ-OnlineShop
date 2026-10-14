"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils/cn";

export interface FormFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Server- or client-side validation messages for this field. */
  errors?: string[];
  hint?: ReactNode;
  /** Content rendered right-aligned on the label row (e.g. a "Forgot password?" link). */
  labelAction?: ReactNode;
  /** Leading icon rendered inside the field. */
  icon?: ReactNode;
  /** Trailing control rendered inside the field (e.g. the password visibility toggle). */
  trailing?: ReactNode;
  /**
   * Visual tone. `default` uses the semantic danger tokens (shared UI layer);
   * `brand` resolves errors/hints to the RobertJ red family for auth surfaces.
   */
  tone?: "default" | "brand";
  /**
   * Renders the resting input through the Admin/Seller portal tokens instead of
   * the fixed rj-* palette, so it inverts correctly in dark mode. Pass from
   * portal forms only (ProductEditor, StockAdjustmentForm, ShopForm); Buyer/auth
   * forms omit it and keep the fixed-light look.
   */
  themed?: boolean;
}

/** Labelled text input wired for screen readers and inline error reporting. */
export function FormField({
  label,
  errors,
  hint,
  labelAction,
  icon,
  trailing,
  tone = "default",
  themed = false,
  className,
  ...props
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const hasError = Boolean(errors?.length);
  const brand = tone === "brand";

  // Error classes come AFTER `className` so a field's resting border (passed
  // in via className) can never mask the error state.
  const inputClasses = cn(
    themed
      ? "h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      : "h-10 rounded-md border border-rj-gray-200 bg-rj-white px-3 text-sm text-rj-black outline-none transition-colors placeholder:text-rj-gray-400 focus-visible:border-rj-black focus-visible:ring-2 focus-visible:ring-rj-red/30",
    icon && "pl-10",
    className,
    hasError &&
      (brand
        ? "border-rj-red focus-visible:ring-rj-red"
        : "border-danger focus-visible:ring-danger"),
  );

  const inputEl = (
    <input
      id={id}
      aria-invalid={hasError}
      aria-describedby={cn(hint && hintId, hasError && errorId) || undefined}
      className={inputClasses}
      {...props}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {labelAction ? <span className="shrink-0">{labelAction}</span> : null}
      </div>
      {icon || trailing ? (
        <div className="relative">
          {inputEl}
          {icon ? (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 left-3.5 flex items-center",
                themed ? "text-muted-foreground" : "text-rj-gray-400",
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          ) : null}
          {trailing ? (
            <span className="absolute inset-y-0 right-0 flex items-center">
              {trailing}
            </span>
          ) : null}
        </div>
      ) : (
        inputEl
      )}
      {hint ? (
        <p
          id={hintId}
          className={cn("text-xs", brand ? "text-rj-gray-600" : "text-muted-foreground")}
        >
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p
          id={errorId}
          role="alert"
          className={cn("text-xs", brand ? "text-rj-red-dark" : "text-danger")}
        >
          {errors?.[0]}
        </p>
      ) : null}
    </div>
  );
}
