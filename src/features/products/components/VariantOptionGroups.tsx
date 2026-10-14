"use client";

import Image from "next/image";
import { useId } from "react";

import type { ProductAttributeKey } from "@/features/categories/types/category.types";
import type { VariantSelection } from "@/features/products/hooks/useVariantSelection";
import { cn } from "@/lib/utils/cn";

export interface VariantOptionGroupsProps {
  selection: VariantSelection;
  /** Axes to flag as still needing a choice (after a failed confirm). */
  flaggedKeys?: ReadonlySet<ProductAttributeKey>;
  /** Show a small photo on color options that have a color-specific photo. */
  showColorThumbnails?: boolean;
}

/**
 * One pill group per option axis (Color, Size, …) — the buyer's option picker,
 * used inline on the product page and inside the options sheet. Values with no
 * in-stock combination (given the other picks) are disabled and struck through;
 * picking the selected value again clears it. Each group is labelled for
 * screen readers, and a flagged group is described by its "Please select…"
 * line (the sheet's own alert announces the summary once).
 */
export function VariantOptionGroups({ selection, flaggedKeys, showColorThumbnails = false }: VariantOptionGroupsProps) {
  const baseId = useId();

  return (
    <div className="flex flex-col gap-4">
      {selection.axes.map((axis) => {
        const labelId = `${baseId}-${axis.key}-label`;
        const errorId = `${baseId}-${axis.key}-error`;
        const flagged = flaggedKeys?.has(axis.key) ?? false;
        const picked = selection.selected[axis.key];
        return (
          <div key={axis.key} data-axis={axis.key}>
            <p id={labelId} className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-600">
              {axis.label}
              {picked ? <span className="ml-1.5 normal-case tracking-normal text-rj-black">: {picked}</span> : null}
            </p>
            <div
              role="group"
              aria-labelledby={labelId}
              aria-describedby={flagged ? errorId : undefined}
              className={cn(
                "flex flex-wrap gap-2 rounded-xl",
                flagged && "-m-1.5 border border-rj-red/50 bg-rj-red/5 p-1.5",
              )}
            >
              {axis.values.map((value) => {
                const available = selection.isOptionAvailable(axis.key, value);
                const isSelected = picked === value;
                const thumb = showColorThumbnails && axis.key === "color" ? selection.colorThumbnails[value] : null;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!available && !isSelected}
                    onClick={() => selection.select(axis.key, value)}
                    aria-pressed={isSelected}
                    title={!available && !isSelected ? "Not available with your other choices" : undefined}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/40 disabled:pointer-events-none",
                      thumb && "pl-1.5",
                      isSelected
                        ? "border-rj-red bg-rj-red/5 text-rj-red-dark"
                        : available
                          ? "border-rj-gray-200 text-rj-black hover:border-rj-black"
                          : "border-rj-gray-100 text-rj-gray-300 line-through",
                    )}
                  >
                    {thumb ? (
                      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-rj-gray-100">
                        <Image src={thumb} alt="" fill sizes="28px" className="object-cover" />
                      </span>
                    ) : null}
                    {value}
                  </button>
                );
              })}
            </div>
            {flagged ? (
              <p id={errorId} className="mt-1.5 text-xs font-medium text-rj-red-dark">
                Please select a {axis.label.toLowerCase()}.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
