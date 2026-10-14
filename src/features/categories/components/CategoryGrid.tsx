import { EmptyState } from "@/components/feedback/EmptyState";
import { CategoryCard } from "@/features/categories/components/CategoryCard";
import type { Category } from "@/features/categories/types/category.types";

export interface CategoryGridProps {
  categories: Category[];
}

export function CategoryGrid({ categories }: CategoryGridProps) {
  if (categories.length === 0) {
    return (
      <EmptyState
        title="No categories yet"
        description="Categories will appear here once products are listed."
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {categories.map((category, index) => (
        <li key={category.id}>
          <CategoryCard category={category} index={index} />
        </li>
      ))}
    </ul>
  );
}
