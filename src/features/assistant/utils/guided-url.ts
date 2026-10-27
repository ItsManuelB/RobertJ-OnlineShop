// No value imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

/**
 * The buyer's Guided Selection answers. They live in the `/assistant` address, so Back works,
 * a result can be shared, and opening a product never loses them.
 */
export interface GuidedAnswers {
  categoryId?: string;
  occasion?: string;
  size?: string;
  color?: string;
  material?: string;
  dimensions?: string;
  /** Whole pesos. */
  minPrice?: number;
  /** Whole pesos. */
  maxPrice?: number;
}

export const GUIDED_STEPS = ["category", "occasion", "details", "budget"] as const;
export type GuidedStep = (typeof GUIDED_STEPS)[number];

/** One removable answer as the buyer sees it; budget covers both bounds. */
export type GuidedAnswerKey = "category" | "occasion" | "size" | "color" | "material" | "dimensions" | "budget";

export const DETAIL_KEYS = ["size", "color", "material", "dimensions"] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];

/** The step where each answer is asked. */
export const STEP_FOR_ANSWER: Record<GuidedAnswerKey, GuidedStep> = {
  category: "category",
  occasion: "occasion",
  size: "details",
  color: "details",
  material: "details",
  dimensions: "details",
  budget: "budget",
};

/** "?category=…&occasion=…&show=1", or "" when there is nothing to add. Order is stable so links compare equal. */
export function guidedSearch(answers: GuidedAnswers, extra: { show?: boolean; step?: GuidedStep } = {}): string {
  const params = new URLSearchParams();
  if (answers.categoryId) params.set("category", answers.categoryId);
  if (answers.occasion) params.set("occasion", answers.occasion);
  for (const key of DETAIL_KEYS) {
    const value = answers[key];
    if (value) params.set(key, value);
  }
  if (answers.minPrice !== undefined) params.set("min", String(answers.minPrice));
  if (answers.maxPrice !== undefined) params.set("max", String(answers.maxPrice));
  if (extra.step) params.set("step", extra.step);
  if (extra.show) params.set("show", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The answers without one of them. Dropping the category also drops the details, which only make sense inside one category. */
export function dropAnswer(answers: GuidedAnswers, key: GuidedAnswerKey): GuidedAnswers {
  const next = { ...answers };
  if (key === "budget") {
    delete next.minPrice;
    delete next.maxPrice;
  } else if (key === "category") {
    delete next.categoryId;
    for (const detail of DETAIL_KEYS) delete next[detail];
  } else {
    delete next[key];
  }
  return next;
}

/** The answers that were given, in question order. */
export function answeredKeys(answers: GuidedAnswers): GuidedAnswerKey[] {
  const keys: GuidedAnswerKey[] = [];
  if (answers.categoryId) keys.push("category");
  if (answers.occasion) keys.push("occasion");
  for (const key of DETAIL_KEYS) if (answers[key]) keys.push(key);
  if (answers.minPrice !== undefined || answers.maxPrice !== undefined) keys.push("budget");
  return keys;
}
