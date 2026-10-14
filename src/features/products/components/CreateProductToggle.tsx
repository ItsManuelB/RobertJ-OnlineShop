"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ProductForm } from "@/features/products/components/ProductForm";
import type { Category, CategoryAttribute } from "@/features/categories/types/category.types";

export interface CreateProductToggleProps {
  categories: Category[];
  categoryAttributes: CategoryAttribute[];
}

/**
 * Seller-only "New product" affordance — admin manages/moderates existing
 * products only, never creates one (see `createProductAction`), so this
 * never renders for them. Split out of the products table so the table
 * itself can be a plain server-rendered list; only this toggle needs client
 * state.
 */
export function CreateProductToggle({ categories, categoryAttributes }: CreateProductToggleProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="primary"
        size="rjSm"
        className="self-start"
        onClick={() => setShowForm((value) => !value)}
      >
        {showForm ? "Cancel" : "New product"}
      </Button>

      {showForm ? (
        <div className="rounded-2xl border border-border bg-muted p-5">
          <ProductForm
            categories={categories}
            categoryAttributes={categoryAttributes}
            onDone={() => setShowForm(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
