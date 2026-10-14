import { CategoryAttributeRow } from "@/features/categories/components/CategoryAttributeRow";
import type {
  CategoryAttribute,
  ProductAttributeKey,
} from "@/features/categories/types/category.types";

const ATTRIBUTE_KEYS: ProductAttributeKey[] = ["color", "size", "material", "dimensions"];

export interface CategoryAttributesPanelProps {
  categoryId: string;
  /** This category's existing config rows (may be fewer than 4 — an unconfigured attribute renders as N/A). */
  attributes: CategoryAttribute[];
}

/** The full color/size/material/dimensions config editor for one category — always renders all 4 keys, regardless of how many `category_attributes` rows already exist. */
export function CategoryAttributesPanel({ categoryId, attributes }: CategoryAttributesPanelProps) {
  const byKey = new Map(attributes.map((attribute) => [attribute.attributeKey, attribute]));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground">
        Decides which specification fields show on the seller product form, which become
        buyer-selectable variant checkboxes, and which questions Guided Selection asks for
        products in this category.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ATTRIBUTE_KEYS.map((key) => (
          <CategoryAttributeRow
            key={key}
            categoryId={categoryId}
            attributeKey={key}
            attribute={byKey.get(key) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
