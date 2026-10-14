"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/feedback/ErrorState";
import { toggleCategoryActiveAction } from "@/features/categories/actions/category.actions";
import { CategoryAttributesPanel } from "@/features/categories/components/CategoryAttributesPanel";
import { CategoryForm } from "@/features/categories/components/CategoryForm";
import type { AdminCategory, CategoryAttribute } from "@/features/categories/types/category.types";

export interface CategoryRowProps {
  category: AdminCategory;
  attributes: CategoryAttribute[];
}

/** One category in the admin management list. Edit swaps the row for an inline `CategoryForm`; "Configure attributes" expands the `category_attributes` editor — mirrors `ShopRow`'s exact shape. */
export function CategoryRow({ category, attributes }: CategoryRowProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [showAttributes, setShowAttributes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (mode === "edit") {
    return (
      <Card>
        <CardContent className="p-5">
          <CategoryForm category={category} onDone={() => setMode("view")} />
          <Button type="button" variant="outline" size="rjSm" className="mt-3" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await toggleCategoryActiveAction(category.id, !category.active);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{category.name}</p>
              <Badge tone={category.active ? "success" : "neutral"}>
                {category.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              /{category.slug} · {category.productCount} product{category.productCount === 1 ? "" : "s"}
            </p>
            {error ? (
              <div className="mt-2">
                <ErrorState title="Something went wrong" message={error} />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="rjSm"
              onClick={() => setShowAttributes((value) => !value)}
            >
              {showAttributes ? "Hide attributes" : "Configure attributes"}
            </Button>
            <Button type="button" variant="outline" size="rjSm" onClick={() => setMode("edit")}>
              Edit
            </Button>
            <Button
              type="button"
              variant={category.active ? "danger" : "rj"}
              size="rjSm"
              isLoading={isPending}
              onClick={handleToggleActive}
            >
              {category.active ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>

        {showAttributes ? (
          <CategoryAttributesPanel categoryId={category.id} attributes={attributes} />
        ) : null}
      </CardContent>
    </Card>
  );
}
