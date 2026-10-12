"use client";

import { useState, useTransition } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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

const selectClasses =
  "h-10 rounded-md border border-rj-gray-200 bg-rj-white px-3 text-sm text-rj-black outline-none transition-colors focus-visible:border-rj-black focus-visible:ring-2 focus-visible:ring-rj-red/30";

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
          Recommend this product (optionally a specific variant) for a buyer&apos;s stated occasion
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
                <label className="text-sm font-medium">Occasion</label>
                <select
                  value={values.occasion ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      occasion:
                        event.target.value === ""
                          ? undefined
                          : (event.target.value as RecommendationRuleFormInput["occasion"]),
                    }))
                  }
                  className={selectClasses}
                >
                  <option value="">Any occasion</option>
                  {OCCASIONS.map((occasion) => (
                    <option key={occasion} value={occasion}>
                      {OCCASION_LABELS[occasion]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Size</label>
                <select
                  value={values.size ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      size:
                        event.target.value === ""
                          ? undefined
                          : (event.target.value as RecommendationRuleFormInput["size"]),
                    }))
                  }
                  className={selectClasses}
                >
                  <option value="">Any size</option>
                  {GUIDED_SELECTION_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                {fieldErrors.size ? (
                  <p role="alert" className="text-xs text-danger">
                    {fieldErrors.size[0]}
                  </p>
                ) : null}
              </div>
            </div>

            {variants.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Specific variant (optional)</label>
                <select
                  value={values.variantId ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      variantId: event.target.value === "" ? undefined : event.target.value,
                    }))
                  }
                  className={selectClasses}
                >
                  <option value="">No specific variant</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {[variant.color, variant.size].filter(Boolean).join(" / ") || variant.id}
                    </option>
                  ))}
                </select>
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
