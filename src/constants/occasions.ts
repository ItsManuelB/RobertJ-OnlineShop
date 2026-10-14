/**
 * Occasion vocabulary shared by Guided Selection (the buyer's Occasion answer)
 * and the product editor ("Good for"). Sellers mark a product with these as
 * product tags; the matcher reads them back (ADR-022). Must stay a superset of
 * the `recommendation_occasion` Postgres enum values still stored on legacy rules.
 */
export const OCCASIONS = [
  "casual",
  "formal",
  "work",
  "sportswear",
  "party",
  "wedding",
  "everyday",
] as const;

export type Occasion = (typeof OCCASIONS)[number];

export function isOccasion(value: string): value is Occasion {
  return (OCCASIONS as readonly string[]).includes(value);
}
