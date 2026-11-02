import type { AdminCategory, CategoryAttribute } from "../types/category.types";

// Type-only imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

export const CATEGORY_STATUS_FILTERS = ["all", "active", "inactive"] as const;
export type CategoryStatusFilter = (typeof CATEGORY_STATUS_FILTERS)[number];

export const CATEGORY_STATUS_FILTER_LABELS: Record<CategoryStatusFilter, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
};

export interface CategorySummary {
  total: number;
  active: number;
  inactive: number;
  /** Names of categories with no products, for the "With no products" card. */
  empty: string[];
}

export function summarizeCategories(categories: readonly AdminCategory[]): CategorySummary {
  const active = categories.filter((category) => category.active).length;
  return {
    total: categories.length,
    active,
    inactive: categories.length - active,
    empty: categories.filter((category) => category.productCount === 0).map((category) => category.name),
  };
}

/** Case-insensitive match on name or slug, then the active / inactive chip. */
export function filterCategories(
  categories: readonly AdminCategory[],
  search: string,
  status: CategoryStatusFilter,
): AdminCategory[] {
  const term = search.trim().toLowerCase();
  return categories.filter((category) => {
    if (status === "active" && !category.active) return false;
    if (status === "inactive" && category.active) return false;
    if (!term) return true;
    return category.name.toLowerCase().includes(term) || category.slug.toLowerCase().includes(term);
  });
}

const SPEC_ORDER = ["color", "size", "material", "dimensions"];

/** Short spec chips for a category row, e.g. "Color required", "Size option". Required wins over option. */
export function describeCategorySpecs(attributes: readonly CategoryAttribute[]): string[] {
  return [...attributes]
    .sort((a, b) => SPEC_ORDER.indexOf(a.attributeKey) - SPEC_ORDER.indexOf(b.attributeKey))
    .flatMap((attribute) => {
      const label = attribute.attributeKey.charAt(0).toUpperCase() + attribute.attributeKey.slice(1);
      if (attribute.isRequired) return [`${label} required`];
      if (attribute.isVariantEligible) return [`${label} option`];
      return [];
    });
}
