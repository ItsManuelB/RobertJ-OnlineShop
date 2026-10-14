"use client";

import { useState, useTransition } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ErrorState } from "@/components/feedback/ErrorState";
import { createRecommendationRuleAction } from "@/features/assistant/actions/rule.actions";
import { RecommendationRuleRow } from "@/features/assistant/components/RecommendationRuleRow";
import {
  GUIDED_SELECTION_SIZES,
  OCCASION_LABELS,
} from "@/features/assistant/constants/assistant.constants";
import {
  OCCASIONS,
  recommendationRuleSchema,
  type RecommendationRuleFormInput,
} from "@/features/assistant/schemas/rule.schema";
import type { RecommendationRule } from "@/features/assistant/types/assistant.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";

type FieldErrors = Record<string, string[] | undefined>;


function emptyInput(productId: string): RecommendationRuleFormInput {
  return { productId, variantId: undefined, occasion: undefined, size: undefined };
}

export interface RecommendationRuleManagerProps {
  product: Product;
  rules: RecommendationRule[];
  /** This product's own variants (already filtered by the caller from one bulk fetch — no N+1), for the optional "specific variant" picker. */
  variants: ProductVariant[];
}

/**
 * Guided Product Selection rule management for one product — edit-mode only,
 * same placement/shape as `ProductVariantManager` (DECISIONS.md ADR-009 —
 * rule-based, never AI/ML; the buyer-facing quiz that consumes these rules
 * is a separate, later phase).
 */
export function RecommendationRuleManager({
  product,
  rules: initialRules,
  variants,
}: RecommendationRuleManagerProps) {
  const [rules, setRules] = useState<RecommendationRule[]>(initialRules);
  const [isAdding, setIsAdding] = useState(false);
  const [values, setValues] = useState<RecommendationRuleFormInput>(() => emptyInput(product.id));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    setFormError(null);
    const parsed = recommendationRuleSchema.safeParse({
      ...values,
      size: values.size || undefined,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await createRecommendationRuleAction(parsed.data);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setRules((prev) => [...prev, result.data]);
      setValues(emptyInput(product.id));
      setFieldErrors({});
      setIsAdding(false);
    });
  }

  function handleCancelAdd() {
    setValues(emptyInput(product.id));
    setFieldErrors({});
    setFormError(null);
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Guided Selection rules (optional)</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Recommend this product (optionally a specific option) for a buyer&apos;s stated occasion
          and/or size. Leave both blank to recommend it for any answer.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No rules yet — this product isn&apos;t recommended by Guided Selection.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <RecommendationRuleRow
              key={rule.id}
              rule={rule}
              variants={variants}
              onChange={(updated) =>
                setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
              }
              onDelete={(id) => setRules((prev) => prev.filter((r) => r.id !== id))}
            />
          ))}
        </ul>
      )}

      {isAdding ? (
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Occasion</span>
                <ChoiceGroup
                  label="Occasion"
                  options={[
                    { value: "", label: "Any occasion" },
                    ...OCCASIONS.map((occasion) => ({ value: occasion, label: OCCASION_LABELS[occasion] })),
                  ]}
                  value={values.occasion ?? ""}
                  onChange={(next) =>
                    setValues((prev) => ({
                      ...prev,
                      occasion: next === "" ? undefined : (next as RecommendationRuleFormInput["occasion"]),
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Size</span>
                <ChoiceGroup
                  label="Size"
                  options={[
                    { value: "", label: "Any size" },
                    ...GUIDED_SELECTION_SIZES.map((size) => ({ value: size, label: size })),
                  ]}
                  value={values.size ?? ""}
                  onChange={(next) =>
                    setValues((prev) => ({
                      ...prev,
                      size: next === "" ? undefined : (next as RecommendationRuleFormInput["size"]),
                    }))
                  }
                />
                {fieldErrors.size ? (
                  <p role="alert" className="text-xs text-danger">
                    {fieldErrors.size[0]}
                  </p>
                ) : null}
              </div>
            </div>

            {variants.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Specific option (optional)</span>
                <ChoiceGroup
                  label="Specific option"
                  options={[
                    { value: "", label: "No specific option" },
                    ...variants.map((variant) => ({
                      value: variant.id,
                      label: [variant.color, variant.size].filter(Boolean).join(" / ") || variant.id,
                    })),
                  ]}
                  value={values.variantId ?? ""}
                  onChange={(next) => setValues((prev) => ({ ...prev, variantId: next === "" ? undefined : next }))}
                />
              </div>
            ) : null}

            {formError ? <ErrorState title="Couldn't add rule" message={formError} /> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" size="rjSm" isLoading={isPending} onClick={handleAdd}>
                Add rule
              </Button>
              <Button
                type="button"
                variant="outline"
                size="rjSm"
                disabled={isPending}
                onClick={handleCancelAdd}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="rjSm"
          className="self-start"
          onClick={() => setIsAdding(true)}
        >
          + Add rule
        </Button>
      )}
    </div>
  );
}
