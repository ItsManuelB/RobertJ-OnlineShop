"use server";

import { revalidatePath } from "next/cache";

import { USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import {
  createCategorySchema,
  deleteCategoryAttributeSchema,
  toggleCategoryActiveSchema,
  updateCategorySchema,
  upsertCategoryAttributeSchema,
} from "@/features/categories/schemas/category.schema";
import type { AdminCategory, CategoryAttribute } from "@/features/categories/types/category.types";

/** Every admin category write touches the same buyer-facing surfaces that read `categories` — the catalog, landing, and sitemap all cache category data. */
function revalidateCategoryPaths() {
  revalidatePath(ROUTES.adminCategories);
  revalidatePath(ROUTES.categories);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.products);
}

/** Admin-only: creates a category. */
export async function createCategoryAction(
  _prevState: ActionResult<AdminCategory> | null,
  formData: FormData,
): Promise<ActionResult<AdminCategory>> {
  const parsed = createCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const category = await queries.createCategory(parsed.data);
    revalidateCategoryPaths();
    return ok(category);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create the category.");
  }
}

/** Admin-only: edits a category's name/description/image/sort order. */
export async function updateCategoryAction(
  _prevState: ActionResult<AdminCategory> | null,
  formData: FormData,
): Promise<ActionResult<AdminCategory>> {
  const parsed = updateCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const category = await queries.updateCategory(parsed.data);
    revalidateCategoryPaths();
    return ok(category);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the category.");
  }
}

/** Admin-only: activates/deactivates a category. */
export async function toggleCategoryActiveAction(
  categoryId: string,
  active: boolean,
): Promise<ActionResult<AdminCategory>> {
  const parsed = toggleCategoryActiveSchema.safeParse({ categoryId, active });
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const category = await queries.toggleCategoryActive(parsed.data.categoryId, parsed.data.active);
    revalidateCategoryPaths();
    return ok(category);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the category.");
  }
}

/**
 * Admin-only: creates or replaces one category's config for one attribute
 * key. `input: unknown` + `safeParse`, mirroring
 * `createRecommendationRuleAction` — this is called directly with a plain
 * object from a checkbox/picklist panel, not a `<form>` submit.
 */
export async function upsertCategoryAttributeAction(
  input: unknown,
): Promise<ActionResult<CategoryAttribute>> {
  const parsed = upsertCategoryAttributeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    const attribute = await queries.upsertCategoryAttribute(parsed.data);
    revalidateCategoryPaths();
    return ok(attribute);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not save this attribute's configuration.",
    );
  }
}

/** Admin-only: removes one category's config for one attribute key. */
export async function deleteCategoryAttributeAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = deleteCategoryAttributeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await queries.requireRole([USER_ROLES.admin]);
    await queries.deleteCategoryAttribute(parsed.data.id);
    revalidateCategoryPaths();
    return ok(null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not remove this attribute.");
  }
}
