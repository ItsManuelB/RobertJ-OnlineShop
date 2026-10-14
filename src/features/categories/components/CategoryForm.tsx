"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/ErrorState";
import { FormField } from "@/components/forms/FormField";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/features/categories/actions/category.actions";
import type { AdminCategory } from "@/features/categories/types/category.types";
import type { ActionResult } from "@/types/action.types";

const textareaClasses =
  "min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export interface CategoryFormProps {
  /** Omit for create mode; pass the category being edited for edit mode. */
  category?: AdminCategory;
  onDone?: () => void;
}

/** Shared create/edit category form — mirrors `ShopForm`'s exact shape, with the extra fields `categories` already has in the DB (description, image, sort order) but never had a UI for (Finding F-1). */
export function CategoryForm({ category, onDone }: CategoryFormProps) {
  const isEdit = Boolean(category);
  const [state, formAction, isPending] = useActionState<
    ActionResult<AdminCategory> | null,
    FormData
  >(isEdit ? updateCategoryAction : createCategoryAction, null);

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined;
  const formError = state && !state.success && !state.fieldErrors ? state.error : undefined;

  useEffect(() => {
    if (state?.success) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} noValidate aria-busy={isPending} className="flex flex-col gap-4">
      {formError ? <ErrorState title="Couldn't save the category" message={formError} /> : null}

      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <FormField
        name="name"
        label="Category name"
        defaultValue={category?.name ?? ""}
        placeholder="e.g. Shirts & Tops"
        errors={fieldErrors?.name}
        required
        themed
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="category-description" className="text-sm font-medium text-foreground">
          Description
        </label>
        <textarea
          id="category-description"
          name="description"
          defaultValue={category?.description ?? ""}
          placeholder="A short, buyer-facing description of this category."
          className={textareaClasses}
        />
        {fieldErrors?.description ? (
          <p className="text-xs text-danger">{fieldErrors.description[0]}</p>
        ) : null}
      </div>

      <FormField
        name="imageUrl"
        label="Cover image URL"
        defaultValue={category?.imageUrl ?? ""}
        placeholder="https://…"
        errors={fieldErrors?.imageUrl}
        themed
      />

      <FormField
        name="sortOrder"
        label="Sort order"
        type="number"
        min="0"
        step="1"
        defaultValue={category?.sortOrder ?? 0}
        errors={fieldErrors?.sortOrder}
        themed
      />

      <Button type="submit" variant="primary" size="rj" isLoading={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving…" : isEdit ? "Save changes" : "Create category"}
      </Button>
    </form>
  );
}
