import { resolveCategoryImage } from "@/constants/category-images";
import { ROUTES } from "@/constants/routes";
import { CategoryTile } from "@/features/categories/components/CategoryTile";
import type { Category } from "@/features/categories/types/category.types";

export interface CategoryCardProps {
  category: Category;
  /** Position in the grid — only used to pick a bundled photo for a category with no image and no known slug. */
  index?: number;
}

/** Real-category tile for the /categories grid. Visual treatment lives in `CategoryTile`. */
export function CategoryCard({ category, index = 0 }: CategoryCardProps) {
  return (
    <CategoryTile
      href={ROUTES.categoryDetail(category.slug)}
      imageUrl={resolveCategoryImage(category, index)}
      name={category.name}
      countLabel={`${category.productCount.toLocaleString("en-US")} item(s)`}
    />
  );
}
