"use server";

import { getClientIp } from "@/lib/utils/request";
import { fail, fromZodError, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { GuidedSelectionCategoryOption, ProductFilterOption } from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import { guidedSelectionQuerySchema } from "@/features/assistant/schemas/quiz.schema";
import type { GuidedSelectionMatch } from "@/features/assistant/types/assistant.types";

/**
 * Buyer-facing Guided Selection match query (DECISIONS.md ADR-009 —
 * rule-based, never AI/ML). Public, no `requireSessionUser()` — a guest can
 * use Guided Selection with no account, same as the rest of the
 * catalog/cart reads (ADR-013's precedent).
 */
export async function getGuidedSelectionMatchesAction(
  input: unknown,
): Promise<ActionResult<GuidedSelectionMatch[]>> {
  const parsed = guidedSelectionQuerySchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    const ip = await getClientIp();
    await queries.requireRateLimit(`guidedSelection:${ip}`, 20, 60);
    const matches = await queries.listGuidedSelectionMatches(parsed.data);
    return ok(matches);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load matches.");
  }
}

/** Categories for the quiz's category step (§6.2 of the implementation plan) — public, same guest-accessible precedent as the rest of Guided Selection. */
export async function getGuidedSelectionCategoriesAction(): Promise<
  ActionResult<GuidedSelectionCategoryOption[]>
> {
  try {
    const ip = await getClientIp();
    await queries.requireRateLimit(`guidedSelectionCategories:${ip}`, 20, 60);
    const categories = await queries.listGuidedSelectionCategories();
    return ok(categories);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load categories.");
  }
}

/**
 * Which attribute questions (Size/Color/Material/Dimensions) to ask once a
 * buyer picks a specific category — reuses the exact same resolver the
 * catalog's attribute filters use (`resolveFilterableAttributes`), so the
 * quiz and the catalog filters never drift into asking about different
 * vocabularies for the same category.
 */
export async function getGuidedSelectionAttributeQuestionsAction(
  categoryId: string,
): Promise<ActionResult<ProductFilterOption[]>> {
  try {
    const ip = await getClientIp();
    await queries.requireRateLimit(`guidedSelectionAttributes:${ip}`, 20, 60);
    const options = await queries.resolveFilterableAttributes(categoryId);
    return ok(options);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load options.");
  }
}
