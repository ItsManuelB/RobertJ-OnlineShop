"use client";

import { Check } from "lucide-react";
import { useId, useRef } from "react";

import { cn } from "@/lib/utils/cn";

export interface GuidedOption {
  /** null is the "Any …" choice. */
  value: string | null;
  label: string;
  /** Count line under the label, e.g. "71 in stock". */
  detail?: string;
}

export interface GuidedOptionCardsProps {
  /** Read by screen readers as the group's name. */
  legend: string;
  options: GuidedOption[];
  /** The chosen value; null = "Any" is chosen; undefined = nothing chosen yet. */
  selected: string | null | undefined;
  /** `viaPointer` is true for a tap or click, so the step can move on by itself; keyboard choices never do. */
  onSelect: (value: string | null, viaPointer: boolean) => void;
  columns?: "two" | "three";
}

/**
 * A single-choice question shown as large cards. Built on real radio inputs, so arrow keys
 * move between choices and screen readers announce a radio group. The selected card has a
 * border, a fill and a check mark, so the state never depends on colour alone. "Any" choices
 * are dashed and neutral, so skipping looks normal.
 */
export function GuidedOptionCards({ legend, options, selected, onSelect, columns = "three" }: GuidedOptionCardsProps) {
  const name = useId();
  const pointer = useRef(false);

  return (
    <fieldset
      onKeyDown={() => {
        pointer.current = false;
      }}
    >
      <legend className="sr-only">{legend}</legend>
      <div
        className={cn(
          "grid grid-cols-2 gap-2.5",
          columns === "three" ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {options.map((option) => {
          const isAny = option.value === null;
          const checked = selected !== undefined && selected === option.value;
          return (
            <label
              key={option.value ?? "any"}
              onPointerDown={() => {
                pointer.current = true;
              }}
              className={cn(
                "relative flex min-h-14 cursor-pointer flex-col justify-center gap-0.5 rounded-2xl border-[1.5px] px-4 py-3 pr-9 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rj-red/30",
                checked
                  ? "border-rj-red bg-rj-red/5"
                  : isAny
                    ? "border-dashed border-rj-gray-200 bg-rj-gray-50 hover:border-rj-gray-400"
                    : "border-rj-gray-200 bg-rj-white hover:border-rj-black",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value ?? ""}
                checked={checked}
                onChange={() => {
                  onSelect(option.value, pointer.current);
                  pointer.current = false;
                }}
                className="sr-only"
              />
              <span className={cn("text-sm font-bold", isAny && !checked ? "text-rj-gray-600" : "text-rj-black")}>
                {option.label}
              </span>
              {option.detail ? <span className="text-xs text-rj-gray-600">{option.detail}</span> : null}
              {checked ? (
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-rj-red text-rj-white"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
