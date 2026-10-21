"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> {
  /** `"indeterminate"` renders the dash state (some, not all, of a group selected) — a DOM-only property React can't set via a plain prop, so it's applied imperatively via ref. */
  checked: boolean | "indeterminate";
}

export function Checkbox({ checked, className, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === "indeterminate";
  }, [checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked === true}
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded border-rj-gray-300 text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
      {...props}
    />
  );
}
