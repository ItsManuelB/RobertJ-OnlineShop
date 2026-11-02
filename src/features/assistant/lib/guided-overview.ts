/**
 * Counts and budget ranges for the Guided Selection steps, worked out from the same candidate
 * pool the matcher uses (ADR-022). Pure on purpose, like `guided-match.ts`, so it is unit-tested
 * with plain objects (scripts/test-guided-overview.mjs).
 *
 * Every count here is "products you could buy right now": a product with options needs an
 * in-stock option, one without needs its own quantity. The steps use these counts to hide
 * choices that lead nowhere and to show how many products each choice leads to.
 */
import type { MatchCandidate, MatchOption } from "./guided-match";

export type AttributeKey = "size" | "color" | "material" | "dimensions";

export interface BudgetPreset {
  /** Whole pesos; null = no lower bound. */
  minPesos: number | null;
  /** Whole pesos; null = no upper bound. */
  maxPesos: number | null;
  count: number;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function inStockOptions(candidate: MatchCandidate): MatchOption[] {
  return candidate.options.filter((option) => option.quantity > 0);
}

export function isPurchasable(candidate: MatchCandidate): boolean {
  return candidate.options.length > 0 ? inStockOptions(candidate).length > 0 : candidate.quantity > 0;
}

/** The cheapest price a buyer could pay today: the cheapest in-stock option, else the product's own price. */
export function lowestPriceCents(candidate: MatchCandidate): number {
  const prices = inStockOptions(candidate).map((option) => option.priceCents ?? candidate.priceCents);
  return prices.length > 0 ? Math.min(...prices) : candidate.priceCents;
}

/** Purchasable products tagged with each occasion. */
export function countOccasions(
  candidates: readonly MatchCandidate[],
  occasions: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(occasions.map((occasion) => [occasion, 0]));
  for (const candidate of candidates) {
    if (!isPurchasable(candidate)) continue;
    const tags = new Set(candidate.tags.map(norm));
    for (const occasion of occasions) {
      if (tags.has(norm(occasion))) counts[occasion] += 1;
    }
  }
  return counts;
}

/**
 * Purchasable products offering each value of one attribute, keyed by the value as given.
 * Size and color only come from options; material and dimensions fall back to the product's
 * own spec, the same resolution the matcher and the cart use.
 */
export function countAttributeValues(
  candidates: readonly MatchCandidate[],
  key: AttributeKey,
  values: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(values.map((value) => [value, 0]));
  const wanted = new Map(values.map((value) => [norm(value), value]));
  for (const candidate of candidates) {
    if (!isPurchasable(candidate)) continue;
    const found = new Set<string>();
    if (candidate.options.length === 0) {
      if (key === "material" || key === "dimensions") found.add(norm(candidate[key]));
    } else {
      for (const option of inStockOptions(candidate)) {
        const value = key === "material" || key === "dimensions" ? option[key] ?? candidate[key] : option[key];
        found.add(norm(value));
      }
    }
    for (const value of found) {
      const original = wanted.get(value);
      if (original !== undefined) counts[original] += 1;
    }
  }
  return counts;
}

/** Rounds a peso amount to a figure people would type: tens under ₱100, fifties under ₱1,000, then hundreds. */
export function niceRound(pesos: number): number {
  const step = pesos < 100 ? 10 : pesos < 1000 ? 50 : pesos < 10000 ? 100 : 500;
  return Math.max(step, Math.round(pesos / step) * step);
}

/**
 * Three budget ranges that split the given prices (cents) into roughly equal thirds:
 * "Up to A", "A to B", "B and up". Returns fewer ranges, or none, when the prices are too
 * close together to split meaningfully. Bounds are inclusive, like the matcher's budget.
 */
export function budgetPresets(pricesCents: readonly number[]): BudgetPreset[] {
  const pesos = [...pricesCents].map((cents) => cents / 100).sort((a, b) => a - b);
  if (pesos.length < 3) return [];
  const at = (fraction: number) => pesos[Math.min(pesos.length - 1, Math.floor(pesos.length * fraction))];
  const low = niceRound(at(1 / 3));
  const high = niceRound(at(2 / 3));
  const count = (min: number | null, max: number | null) =>
    pesos.filter((price) => (min === null || price >= min) && (max === null || price <= max)).length;

  if (low >= high) {
    const mid = niceRound(at(1 / 2));
    const ranges: BudgetPreset[] = [
      { minPesos: null, maxPesos: mid, count: count(null, mid) },
      { minPesos: mid, maxPesos: null, count: count(mid, null) },
    ];
    return ranges.every((range) => range.count > 0) ? ranges : [];
  }

  return [
    { minPesos: null, maxPesos: low, count: count(null, low) },
    { minPesos: low, maxPesos: high, count: count(low, high) },
    { minPesos: high, maxPesos: null, count: count(high, null) },
  ].filter((range) => range.count > 0);
}

function pesoLabel(pesos: number): string {
  return `₱${pesos.toLocaleString("en-PH")}`;
}

/** "Up to ₱50", "₱50 to ₱180", "₱180 and up". */
export function budgetLabel(minPesos: number | null, maxPesos: number | null): string {
  if (minPesos !== null && maxPesos !== null) return `${pesoLabel(minPesos)} to ${pesoLabel(maxPesos)}`;
  if (maxPesos !== null) return `Up to ${pesoLabel(maxPesos)}`;
  if (minPesos !== null) return `${pesoLabel(minPesos)} and up`;
  return "Any budget";
}
