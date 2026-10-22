/**
 * Guided Selection matching, straight from the catalog (ADR-022). Pure on
 * purpose: no framework or Supabase imports, so the accuracy rules below are
 * unit-testable with plain objects (scripts/test-guided-match.mjs).
 *
 * The rules, each of which exists to prevent a specific wrong recommendation:
 *  - Only what can be bought is recommended. A product with options needs an
 *    in-stock option; a product without options needs its own quantity > 0.
 *  - Size / color / material / dimensions are checked against ONE option, so
 *    "M in Black" means a Black option in M, never "some M and some Black".
 *    Material and dimensions fall back to the product's own spec when the
 *    option has none (the same resolution the cart uses).
 *  - Strings compare trimmed and case-insensitively.
 *  - Budget is checked against the matched option's live price (its own price,
 *    else the product's). A product just outside the budget is kept as a
 *    "close" match with a note, never silently mixed in with exact ones.
 *  - A size or color the buyer asked for is only matched against options that
 *    carry that attribute. When a product has NO size (or color) data at all,
 *    it is not silently dropped and not claimed as a match: it is returned as
 *    "unconfirmed" with a note, ranked after exact and close matches, and still
 *    has to satisfy every other answer (stock, budget, material, ...).
 *  - Occasion comes from seller tags. A matching tag ranks first; a product
 *    with no occasion tag at all still qualifies (ranked lower); a product
 *    tagged only for other occasions is excluded.
 */

export interface MatchOption {
  id: string;
  color: string | null;
  size: string | null;
  material: string | null;
  dimensions: string | null;
  priceCents: number | null;
  quantity: number;
}

export interface MatchCandidate {
  id: string;
  priceCents: number;
  /** The product's own stock — used only when it has no options. */
  quantity: number;
  material: string | null;
  dimensions: string | null;
  tags: string[];
  /** Active options with their live stock. */
  options: MatchOption[];
}

export interface MatchQuery {
  occasion?: string;
  size?: string;
  color?: string;
  material?: string;
  dimensions?: string;
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
}

export interface MatchResult {
  candidateId: string;
  /** The option that satisfied the buyer's answers; null when no attribute was asked or the product has no options. */
  optionId: string | null;
  optionLabel: string | null;
  matchedPriceCents: number;
  fit: "exact" | "close" | "unconfirmed";
  /** Why a "close" match is close ("₱120.00 over your budget") or what an "unconfirmed" one lacks ("Size not confirmed"). */
  note: string | null;
}

/** How far outside the budget a product may be and still show as a "close" match. */
export const CLOSE_BUDGET_MARGIN = 0.25;

const OCCASION_TAGS = ["casual", "formal", "work", "sportswear", "party", "wedding", "everyday"];

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function asked(value: string | undefined): string {
  return norm(value);
}

function occasionRank(tags: string[], occasion: string): 0 | 1 | null {
  const normalized = tags.map(norm);
  if (occasion && normalized.includes(occasion)) return 0;
  const hasAnyOccasionTag = normalized.some((tag) => OCCASION_TAGS.includes(tag));
  // Tagged only for other occasions: not for this buyer.
  if (occasion && hasAnyOccasionTag) return null;
  return 1;
}

function formatPesos(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function optionLabel(option: MatchOption): string | null {
  return [option.color, option.size, option.material, option.dimensions].filter(Boolean).join(" / ") || null;
}

interface Resolved {
  optionId: string | null;
  label: string | null;
  priceCents: number;
  /** Asked-for attributes this product has no data for, e.g. ["size"]. */
  unconfirmed: string[];
}

function hasData(candidate: MatchCandidate, key: "size" | "color"): boolean {
  return candidate.options.some((option) => norm(option[key]) !== "");
}

/** Every purchasable (option or whole product) that satisfies the attribute answers, ignoring budget. */
function resolveAttributes(candidate: MatchCandidate, query: MatchQuery): Resolved[] {
  const material = asked(query.material);
  const dimensions = asked(query.dimensions);
  // An axis the product has no data for can't be checked: skip it and say so.
  const unconfirmed: string[] = [];
  let size = asked(query.size);
  let color = asked(query.color);
  if (size && !hasData(candidate, "size")) {
    unconfirmed.push("size");
    size = "";
  }
  if (color && !hasData(candidate, "color")) {
    unconfirmed.push("color");
    color = "";
  }
  const narrowing = Boolean(size || color || material || dimensions);

  if (candidate.options.length === 0) {
    if (candidate.quantity <= 0) return [];
    if (material && norm(candidate.material) !== material) return [];
    if (dimensions && norm(candidate.dimensions) !== dimensions) return [];
    return [{ optionId: null, label: null, priceCents: candidate.priceCents, unconfirmed }];
  }

  return candidate.options
    .filter((option) => option.quantity > 0)
    .filter((option) => !size || norm(option.size) === size)
    .filter((option) => !color || norm(option.color) === color)
    .filter((option) => !material || norm(option.material ?? candidate.material) === material)
    .filter((option) => !dimensions || norm(option.dimensions ?? candidate.dimensions) === dimensions)
    .map((option) => ({
      optionId: narrowing ? option.id : null,
      label: narrowing ? optionLabel(option) : null,
      priceCents: option.priceCents ?? candidate.priceCents,
      unconfirmed,
    }));
}

/**
 * Ranks candidates for one buyer query. Exact matches come first (occasion-tagged
 * before untagged; ties keep the input order, i.e. newest first), then close
 * matches (nearest to the budget first).
 */
export function matchCandidates(candidates: MatchCandidate[], query: MatchQuery, limit = 24): MatchResult[] {
  const occasion = asked(query.occasion);
  const min = query.minPriceCents ?? null;
  const max = query.maxPriceCents ?? null;

  const exact: { result: MatchResult; rank: number; order: number }[] = [];
  const close: { result: MatchResult; distance: number; order: number }[] = [];
  const unconfirmed: { result: MatchResult; order: number }[] = [];

  candidates.forEach((candidate, order) => {
    const rank = occasionRank(candidate.tags, occasion);
    if (rank === null) return;

    const resolved = resolveAttributes(candidate, query);
    if (resolved.length === 0) return;

    const inBudget = resolved.filter(
      (item) => (min === null || item.priceCents >= min) && (max === null || item.priceCents <= max),
    );

    if (inBudget.length > 0) {
      const best = inBudget.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
      if (best.unconfirmed.length > 0) {
        unconfirmed.push({
          order,
          result: {
            candidateId: candidate.id,
            optionId: best.optionId,
            optionLabel: best.label,
            matchedPriceCents: best.priceCents,
            fit: "unconfirmed",
            note: `${best.unconfirmed.join(" and ").replace(/^./, (c) => c.toUpperCase())} not confirmed`,
          },
        });
        return;
      }
      exact.push({
        order,
        rank,
        result: {
          candidateId: candidate.id,
          optionId: best.optionId,
          optionLabel: best.label,
          matchedPriceCents: best.priceCents,
          fit: "exact",
          note: null,
        },
      });
      return;
    }

    // Outside the budget: keep it only when it is within the margin. A product
    // with unconfirmed attributes is not also offered as "close" — one caveat at a time.
    if (resolved.some((item) => item.unconfirmed.length > 0)) return;
    let nearest: { item: Resolved; distance: number; over: boolean } | null = null;
    for (const item of resolved) {
      const over = max !== null && item.priceCents > max;
      const bound = over ? (max as number) : (min as number);
      if (bound === null || bound === undefined) continue;
      const distance = Math.abs(item.priceCents - bound);
      if (distance > bound * CLOSE_BUDGET_MARGIN) continue;
      if (!nearest || distance < nearest.distance) nearest = { item, distance, over };
    }
    if (!nearest) return;
    close.push({
      order,
      distance: nearest.distance,
      result: {
        candidateId: candidate.id,
        optionId: nearest.item.optionId,
        optionLabel: nearest.item.label,
        matchedPriceCents: nearest.item.priceCents,
        fit: "close",
        note: nearest.over
          ? `${formatPesos(nearest.distance)} over your budget`
          : `${formatPesos(nearest.distance)} under your budget`,
      },
    });
  });

  exact.sort((a, b) => a.rank - b.rank || a.order - b.order);
  close.sort((a, b) => a.distance - b.distance || a.order - b.order);

  unconfirmed.sort((a, b) => a.order - b.order);

  return [
    ...exact.map((item) => item.result),
    ...close.map((item) => item.result),
    ...unconfirmed.map((item) => item.result),
  ].slice(0, limit);
}
