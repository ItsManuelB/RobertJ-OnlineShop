"use client";

import { useId } from "react";

import { cn } from "@/lib/utils/cn";

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: string;
  /** Secondary line, shown under the label in the `tile` variant. */
  description?: string;
  disabled?: boolean;
}

export interface ChoiceGroupProps<V extends string = string> {
  /** Accessible name for the group (screen readers announce it with each choice). */
  label: string;
  options: ChoiceOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Set it to submit the choice with a surrounding `<form>`; otherwise the group is only a controlled input. */
  name?: string;
  /** `pill`: compact chips for short labels. `tile`: larger cards that can carry a description. */
  variant?: "pill" | "tile";
  disabled?: boolean;
  className?: string;
}

const BASE =
  "relative flex min-h-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] px-4 py-2 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring/40";
const TILE_BASE =
  "relative flex min-h-16 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-xl border-2 px-4 py-3 text-left transition-colors focus-within:ring-2 focus-within:ring-ring/40";

/**
 * Visible single-choice control — the replacement for a `<select>` when the
 * options are few enough to show at once. Built on native radio inputs so
 * keyboard (arrow keys), screen readers and form submission all work without
 * custom handling; the radio itself is visually hidden and the label is the
 * styled target.
 */
export function ChoiceGroup<V extends string = string>({
  label,
  options,
  value,
  onChange,
  name,
  variant = "pill",
  disabled = false,
  className,
}: ChoiceGroupProps<V>) {
  const generatedName = useId();
  const groupName = name ?? generatedName;

  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const checked = option.value === value;
        const isDisabled = disabled || option.disabled;
        return (
          <label
            key={option.value}
            className={cn(
              variant === "tile" ? TILE_BASE : BASE,
              checked
                ? variant === "tile"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/60",
              isDisabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={checked}
              disabled={isDisabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className={variant === "tile" ? "text-sm font-semibold" : undefined}>{option.label}</span>
            {variant === "tile" && option.description ? (
              <span className="text-xs text-muted-foreground">{option.description}</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
