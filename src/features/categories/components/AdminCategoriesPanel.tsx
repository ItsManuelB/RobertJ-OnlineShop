"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/feedback/EmptyState";
import { CategoryForm } from "@/features/categories/components/CategoryForm";
import { CategoryRow } from "@/features/categories/components/CategoryRow";
import type { AdminCategory, CategoryAttribute } from "@/features/categories/types/category.types";
import {
  CATEGORY_STATUS_FILTERS,
  CATEGORY_STATUS_FILTER_LABELS,
  filterCategories,
  summarizeCategories,
  type CategoryStatusFilter,
} from "@/features/categories/utils/category-admin";
import { cn } from "@/lib/utils/cn";

export interface AdminCategoriesPanelProps {
  categories: AdminCategory[];
  attributes: CategoryAttribute[];
}

const SUMMARY_CARD = "flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3";

/** `/admin/categories` list: summary cards, search, active / inactive chips, then one row per category. Filtering is local because the page already loads every category. */
export function AdminCategoriesPanel({ categories, attributes }: AdminCategoriesPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CategoryStatusFilter>("all");

  const attributesByCategory = new Map<string, CategoryAttribute[]>();
  for (const attribute of attributes) {
    const list = attributesByCategory.get(attribute.categoryId) ?? [];
    list.push(attribute);
    attributesByCategory.set(attribute.categoryId, list);
  }

  const summary = summarizeCategories(categories);
  const visible = filterCategories(categories, search, status);
  const counts: Record<CategoryStatusFilter, number> = {
    all: summary.total,
    active: summary.active,
    inactive: summary.inactive,
  };

  return (
    <div className="flex flex-col gap-6">
      {categories.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{summary.total}</span>
            <span className="text-sm font-semibold text-foreground">Categories</span>
          </li>
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-primary">{summary.active}</span>
            <span className="text-sm font-semibold text-foreground">Active</span>
          </li>
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{summary.inactive}</span>
            <span className="text-sm font-semibold text-foreground">Inactive</span>
          </li>
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-warning">{summary.empty.length}</span>
            <span className="text-sm font-semibold text-foreground">With no products</span>
            {summary.empty.length > 0 ? (
              <span className="truncate text-xs text-muted-foreground">{summary.empty.join(", ")}</span>
            ) : null}
          </li>
        </ul>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] flex-1">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories"
              aria-label="Search categories"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="rjSm"
            onClick={() => setShowCreateForm((value) => !value)}
          >
            {showCreateForm ? "Cancel" : "New category"}
          </Button>
        </div>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter categories by status">
            {CATEGORY_STATUS_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={cn(status === value ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED)}
              >
                {CATEGORY_STATUS_FILTER_LABELS[value]}
                <span className="ml-1.5 tabular-nums opacity-80">{counts[value]}</span>
              </button>
            ))}
          </div>
        ) : null}
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
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matching categories"
          description="Try a different search term or clear a filter."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((category) => (
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
