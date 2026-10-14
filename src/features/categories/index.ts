// Public type + server-component surface. The read service is server-only and
// imported directly by Server Components (see features/products for the same
// convention), so it is deliberately not re-exported here where a Client
// Component might reach it.
export { CategoryCard } from "./components/CategoryCard";
export { CategoryGrid } from "./components/CategoryGrid";

// Admin management surface (closes Finding F-1 — see
// docs/plans/product-specifications-and-variants-implementation.md).
export { AdminCategoriesPanel } from "./components/AdminCategoriesPanel";
export { CategoryRow } from "./components/CategoryRow";
export { CategoryForm } from "./components/CategoryForm";
export { CategoryAttributesPanel } from "./components/CategoryAttributesPanel";
export { CategoryAttributeRow } from "./components/CategoryAttributeRow";
export {
  createCategoryAction,
  updateCategoryAction,
  toggleCategoryActiveAction,
  upsertCategoryAttributeAction,
  deleteCategoryAttributeAction,
} from "./actions/category.actions";
export {
  createCategorySchema,
  updateCategorySchema,
  toggleCategoryActiveSchema,
  upsertCategoryAttributeSchema,
  deleteCategoryAttributeSchema,
} from "./schemas/category.schema";
export type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ToggleCategoryActiveInput,
  UpsertCategoryAttributeInput,
  DeleteCategoryAttributeInput,
} from "./schemas/category.schema";
export type { Category, AdminCategory, CategoryAttribute, ProductAttributeKey } from "./types/category.types";
