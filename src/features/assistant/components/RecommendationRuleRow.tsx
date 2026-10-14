"use client";

import { useState, useTransition } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  deleteRecommendationRuleAction,
  updateRecommendationRuleAction,
} from "@/features/assistant/actions/rule.actions";
import {
  GUIDED_SELECTION_SIZES,
  OCCASION_LABELS,
} from "@/features/assistant/constants/assistant.constants";
import {
  isGuidedSelectionSize,
  OCCASIONS,
  updateRecommendationRuleSchema,
  type UpdateRecommendationRuleInput,
} from "@/features/assistant/schemas/rule.schema";
import type { RecommendationRule } from "@/features/assistant/types/assistant.types";
import type { ProductVariant } from "@/features/products/types/product.types";

type FieldErrors = Record<string, string[] | undefined>;
type Mode = "view" | "edit" | "delete";


function toInput(rule: RecommendationRule): UpdateRecommendationRuleInput {
  return {
    id: rule.id,
    variantId: rule.variantId ?? undefined,
    occasion: rule.occasion ?? undefined,
    size: isGuidedSelectionSize(rule.size) ? rule.size : undefined,
    active: rule.active,
  };
}

export interface RecommendationRuleRowProps {
  rule: RecommendationRule;
  /** This product's own variants (for the optional "specific variant" picker) — already filtered by the manager from one bulk fetch. */
  variants: ProductVariant[];
  onChange: (rule: RecommendationRule) => void;
  onDelete: (ruleId: string) => void;
}

/** One rule in `RecommendationRuleManager`: view, edit-in-place, delete-confirm — same shape as `ProductVariantRow`. */
export function RecommendationRuleRow({
  rule,
  variants,
  onChange,
  onDelete,
}: RecommendationRuleRowProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [values, setValues] = useState<UpdateRecommendationRuleInput>(() => toInput(rule));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function handleSave() {
    setFormError(null);
    const parsed = updateRecommendationRuleSchema.safeParse({
      ...values,
      size: values.size || undefined,
    });
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors as FieldErrors);
      return;
    }
    startSaving(async () => {
      const result = await updateRecommendationRuleAction(parsed.data);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      onChange(result.data);
      setMode("view");
    });
  }

  function handleCancelEdit() {
    setValues(toInput(rule));
    setFieldErrors({});
    setFormError(null);
    setMode("view");
  }

  function handleDelete() {
    startDeleting(async () => {
      const result = await deleteRecommendationRuleAction({ id: rule.id });
      if (!result.success) {
        setFormError(result.error);
        setMode("view");
        return;
      }
      onDelete(rule.id);
    });
  }

  const label = [
    rule.occasion ? OCCASION_LABELS[rule.occasion] : "Any occasion",
    rule.size ? `size ${rule.size}` : "any size",
  ].join(" · ");

  if (mode === "edit") {
    return (
      <li className="rounded-xl border border-border p-4">
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
                      occasion: next === "" ? undefined : (next as UpdateRecommendationRuleInput["occasion"]),
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
                      size: next === "" ? undefined : (next as UpdateRecommendationRuleInput["size"]),
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

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={values.active ?? true}
              onChange={(event) => setValues((prev) => ({ ...prev, active: event.target.checked }))}
            />
            Active
          </label>

          {formError ? <ErrorState title="Couldn't save rule" message={formError} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="rjSm" isLoading={isSaving} onClick={handleSave}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="rjSm"
              disabled={isSaving}
              onClick={handleCancelEdit}
            >
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  if (mode === "delete") {
    return (
      <li className="rounded-xl border border-border p-4">
        <ConfirmPanel
          label={`Delete ${label} rule`}
          title={`Delete "${label}"?`}
          description="This can't be undone."
          tone="danger"
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          isPending={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setMode("view")}
        />
        {formError ? (
          <div className="mt-2">
            <ErrorState title="Couldn't delete rule" message={formError} />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {!rule.active ? <Badge tone="warning">Inactive</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {rule.variantLabel ? `Recommends ${rule.variantLabel}` : "Recommends this product"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="rjSm" onClick={() => setMode("edit")}>
          Edit
        </Button>
        <Button type="button" variant="outline" size="rjSm" onClick={() => setMode("delete")}>
          Delete
        </Button>
      </div>
    </li>
  );
}
