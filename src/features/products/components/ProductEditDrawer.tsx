"use client";

import { Drawer } from "@/components/ui/drawer";
import { RecommendationRuleManager, type RecommendationRule } from "@/features/assistant";
import { ProductForm } from "@/features/products/components/ProductForm";
import { ProductVariantManager } from "@/features/products/components/ProductVariantManager";
import type { Category, CategoryAttribute } from "@/features/categories/types/category.types";
import type { Product, ProductVariant } from "@/features/products/types/product.types";

export interface ProductEditDrawerProps {
  /** The product being edited, or `null` when the drawer is closed. */
  product: Product | null;
  categories: Category[];
  /** Every category's attribute config — see `ProductForm`/`ProductVariantManager` for how each filters it to the relevant category. */
  categoryAttributes: CategoryAttribute[];
  /** The open product's own variants, or `[]` while closed. */
  variants: ProductVariant[];
  /** The open product's own Guided Selection rules, or `[]` while closed. */
  rules: RecommendationRule[];
  onClose: () => void;
}

/**
 * Right-side edit view for one product — replaces `DashboardProductRow`'s
 * old "expand the card in place" edit mode so opening a row doesn't push the
 * rest of the table down. Same three sections as before (details,
 * variants, Guided Selection rules), just inside a `Drawer` instead of a
 * `Card`.
 */
export function ProductEditDrawer({
  product,
  categories,
  categoryAttributes,
  variants,
  rules,
  onClose,
}: ProductEditDrawerProps) {
  return (
    <Drawer open={product !== null} onClose={onClose} title={product ? `Edit — ${product.title}` : "Edit"}>
      {product ? (
        <div className="flex flex-col gap-6">
          <ProductForm
            categories={categories}
            categoryAttributes={categoryAttributes}
            product={product}
            variants={variants}
            onDone={onClose}
          />
          <div className="border-t border-border pt-5">
            <ProductVariantManager
              product={product}
              variants={variants}
              categoryAttributes={categoryAttributes}
            />
          </div>
          <div className="border-t border-border pt-5">
            <RecommendationRuleManager product={product} rules={rules} variants={variants} />
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
