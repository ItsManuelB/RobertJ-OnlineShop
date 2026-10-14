"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  deleteCategoryAttributeAction,
  upsertCategoryAttributeAction,
} from "@/features/categories/actions/category.actions";
import type {
  CategoryAttribute,
  ProductAttributeKey,
} from "@/features/categories/types/category.types";

const ATTRIBUTE_LABELS: Record<ProductAttributeKey, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

export interface CategoryAttributeRowProps {
  categoryId: string;
  attributeKey: ProductAttributeKey;
  /** The existing config row for this (category, attribute), or null if this category hasn't configured this attribute at all yet (N/A). */
  attribute: CategoryAttribute | null;
}

function parseAllowedValues(text: string): string[] | null {
  const values = text
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length > 0 ? values : null;
}

/**
 * One row of the category × attribute config matrix — the live editor for
 * `category_attributes`. Encodes the plan's two-layer requiredness model
 * (§3.5) directly in the controls: checking "Required spec" clears and
 * disables "Variant-eligible" (and vice versa), and "Recommended" is only
 * enabled once "Variant-eligible" is on — the same invariants the DB CHECK
 * constraints and the Zod schema both enforce, surfaced here so a seller
 * form (Phase 3) never discovers an invalid combination only at save time.
 */
export function CategoryAttributeRow({ categoryId, attributeKey, attribute }: CategoryAttributeRowProps) {
  const [isRequired, setIsRequired] = useState(attribute?.isRequired ?? false);
  const [isVariantEligible, setIsVariantEligible] = useState(attribute?.isVariantEligible ?? false);
  const [isRecommended, setIsRecommended] = useState(attribute?.isRecommended ?? false);
  const [allowedValuesText, setAllowedValuesText] = useState(
    attribute?.allowedValues?.join(", ") ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRemovePending, startRemoveTransition] = useTransition();

  const isConfigured = Boolean(attribute);
  const isDirty =
    isRequired !== (attribute?.isRequired ?? false) ||
    isVariantEligible !== (attribute?.isVariantEligible ?? false) ||
    isRecommended !== (attribute?.isRecommended ?? false) ||
    allowedValuesText !== (attribute?.allowedValues?.join(", ") ?? "");

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await upsertCategoryAttributeAction({
        categoryId,
        attributeKey,
        isRequired,
        isVariantEligible,
        isRecommended,
        allowedValues: parseAllowedValues(allowedValuesText),
      });
      if (!result.success) setError(result.error);
    });
  }

  function handleRemove() {
    if (!attribute) return;
    setError(null);
    startRemoveTransition(async () => {
      const result = await deleteCategoryAttributeAction({ id: attribute.id });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsRequired(false);
      setIsVariantEligible(false);
      setIsRecommended(false);
      setAllowedValuesText("");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{ATTRIBUTE_LABELS[attributeKey]}</p>
        {!isConfigured && !isDirty ? (
          <span className="text-xs text-muted-foreground">Not offered — N/A</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={isRequired}
            onChange={(event) => {
              const checked = event.target.checked;
              setIsRequired(checked);
              if (checked) {
                setIsVariantEligible(false);
                setIsRecommended(false);
              }
            }}
          />
          Required spec
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={isVariantEligible}
            onChange={(event) => {
              const checked = event.target.checked;
              setIsVariantEligible(checked);
              if (checked) {
                setIsRequired(false);
              } else {
                setIsRecommended(false);
              }
            }}
          />
          Variant-eligible (seller checkbox)
        </label>

        <label
          className={
            isVariantEligible
              ? "flex items-center gap-2 text-sm text-foreground"
              : "flex items-center gap-2 text-sm text-muted-foreground"
          }
        >
          <Checkbox
            checked={isRecommended}
            disabled={!isVariantEligible}
            onChange={(event) => setIsRecommended(event.target.checked)}
          />
          Recommended
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`allowed-values-${categoryId}-${attributeKey}`} className="text-xs font-medium text-muted-foreground">
          Allowed values (comma-separated — blank = free text)
        </label>
        <input
          id={`allowed-values-${categoryId}-${attributeKey}`}
          type="text"
          value={allowedValuesText}
          onChange={(event) => setAllowedValuesText(event.target.value)}
          placeholder="e.g. XS, S, M, L, XL"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>

      {error ? <ErrorState title="Couldn't save" message={error} /> : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="primary" size="rjSm" isLoading={isPending} disabled={!isDirty} onClick={handleSave}>
          Save
        </Button>
        {isConfigured ? (
          <Button
            type="button"
            variant="outline"
            size="rjSm"
            isLoading={isRemovePending}
            onClick={handleRemove}
          >
            Remove (set to N/A)
          </Button>
        ) : null}
      </div>
    </div>
  );
}
