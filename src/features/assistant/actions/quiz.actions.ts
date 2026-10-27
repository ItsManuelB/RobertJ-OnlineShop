"use server";

import { z } from "zod";

import { getClientIp } from "@/lib/utils/request";
import { fail, ok } from "@/lib/utils/result";
import * as queries from "@/lib/supabase/queries";
import type { GuidedSelectionOverview } from "@/lib/supabase/queries";
import type { ActionResult } from "@/types/action.types";
import { OCCASIONS } from "@/features/assistant/schemas/rule.schema";

/**
 * Counts and budget ranges for the Guided Selection steps once the buyer picks a category
 * (DECISIONS.md ADR-009 — rule-based, never AI/ML). Public, no `requireSessionUser()`: a guest
 * can use Guided Selection with no account. Shares the page's rate-limit bucket.
 */
export async function getGuidedSelectionStepDataAction(
  categoryId: unknown,
): Promise<ActionResult<GuidedSelectionOverview>> {
  const parsed = z.uuid().optional().safeParse(categoryId ?? undefined);
  if (!parsed.success) return fail("That category isn't available.");

  try {
    const ip = await getClientIp();
    await queries.requireRateLimit(`guidedSelection:${ip}`, 30, 60);
    return ok(await queries.getGuidedSelectionOverview(parsed.data, OCCASIONS));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load the next question.");
  }
}
