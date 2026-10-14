"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { CategoryForm } from "@/features/categories/components/CategoryForm";
import { CategoryRow } from "@/features/categories/components/CategoryRow";
import type { AdminCategory, CategoryAttribute } from "@/features/categories/types/category.types";

export interface AdminCategoriesPanelProps {
  categories: AdminCategory[];
  attributes: CategoryAttribute[];
}

/** `/admin/categories`'s list — mirrors `AdminShopsPanel`'s exact shape (a "New category" toggle + one row per category). */
export function AdminCategoriesPanel({ categories, attributes }: AdminCategoriesPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const attributesByCategory = new Map<string, CategoryAttribute[]>();
  for (const attribute of attributes) {
    const list = attributesByCategory.get(attribute.categoryId) ?? [];
    list.push(attribute);
    attributesByCategory.set(attribute.categoryId, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"}
        </p>
        <Button
          type="button"
          variant="primary"
          size="rjSm"
          onClick={() => setShowCreateForm((value) => !value)}
        >
          {showCreateForm ? "Cancel" : "New category"}
        </Button>
      </div>

      {showCreateForm ? (
        <div className="rounded-2xl border border-border bg-muted p-5">
          <CategoryForm onDone={() => setShowCreateForm(false)} />
        </div>
      ) : null}

      {categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create the first category to start organizing the catalog."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              attributes={attributesByCategory.get(category.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
