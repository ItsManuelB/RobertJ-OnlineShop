import { OCCASIONS, SIZES } from "@/features/assistant/schemas/rule.schema";

/** Shared display labels for `recommendation_occasion` — admin/seller rule
 * authoring (`RecommendationRuleManager`/`RecommendationRuleRow`) and the
 * buyer-facing quiz (`GuidedSelectorQuiz`) both read from this one map. */
export const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  casual: "Casual",
  formal: "Formal",
  work: "Work",
  sportswear: "Sportswear",
  party: "Party",
  wedding: "Wedding",
  everyday: "Everyday",
};

/**
 * Re-export of `SIZES` (see `rule.schema.ts` for the enum + full rationale)
 * under the display-facing name components import. `GuidedSelectorQuiz`,
 * `RecommendationRuleManager`, `RecommendationRuleRow`, and
 * `SmartAssistantPreview` all read from this one list, same shape as
 * `OCCASION_LABELS` above — so a buyer's selection and a seller's rule are
 * always drawn from the same vocabulary instead of two independent free-text
 * fields that could never reliably match.
 */
export const GUIDED_SELECTION_SIZES = SIZES;
