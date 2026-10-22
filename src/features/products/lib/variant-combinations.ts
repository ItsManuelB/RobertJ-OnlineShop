/**
 * Pure helpers for building a product's color × size options and for keeping
 * its options consistent. No runtime imports (unit-tested with Node's runner —
 * see scripts/test-variant-combinations.mjs).
 */

export interface VariantAxisValues {
  color?: string | null;
  size?: string | null;
  material?: string | null;
  dimensions?: string | null;
}

const AXES = ["color", "size", "material", "dimensions"] as const;
type Axis = (typeof AXES)[number];

const AXIS_LABELS: Record<Axis, string> = {
  color: "Color",
  size: "Size",
  material: "Material",
  dimensions: "Dimensions",
};

/** One generated batch can't exceed this — keeps a mistyped list from creating hundreds of rows. */
export const MAX_GENERATED_VARIANTS = 60;

function filledAxes(values: VariantAxisValues): Axis[] {
  return AXES.filter((axis) => Boolean(values[axis]?.trim()));
}

function describeAxes(axes: Axis[]): string {
  return axes.map((axis) => AXIS_LABELS[axis]).join(" + ");
}

/**
 * Every option of one product must use the same choices. A product whose rows
 * mix "Blue" (color only) with "32" (size only) has no row a buyer can match
 * on both, so the product page can't sell it. Returns a message when
 * `candidate` would break that, else null. No existing options = anything goes.
 */
export function axisConsistencyError(
  existing: VariantAxisValues[],
  candidate: VariantAxisValues,
): string | null {
  if (existing.length === 0) return null;
  const expected = filledAxes(existing[0]);
  const actual = filledAxes(candidate);
  if (expected.length === actual.length && expected.every((axis, i) => axis === actual[i])) return null;
  return (
    `Every option of a product must use the same choices (this product's options use ` +
    `${describeAxes(expected)}). Fill in ${describeAxes(expected)}, or remove the other options first.`
  );
}

/** Splits a typed list ("Blue, Red\nGreen") into trimmed values, dropping blanks and case-insensitive repeats. */
export function parseValueList(raw: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const value = part.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

export interface CombinationPlan {
  /** Color/size pairs that don't exist yet, in color-then-size order. */
  toCreate: Array<{ color: string; size: string }>;
  /** Pairs skipped because the product already has them. */
  alreadyExist: number;
}

/** The color × size grid minus what the product already has (compared case-insensitively). */
export function planColorSizeCombinations(
  colors: string[],
  sizes: string[],
  existing: VariantAxisValues[],
): CombinationPlan {
  const have = new Set(
    existing.map((v) => `${(v.color ?? "").toLowerCase()}|${(v.size ?? "").toLowerCase()}`),
  );
  const toCreate: CombinationPlan["toCreate"] = [];
  let alreadyExist = 0;
  for (const color of colors) {
    for (const size of sizes) {
      if (have.has(`${color.toLowerCase()}|${size.toLowerCase()}`)) alreadyExist += 1;
      else toCreate.push({ color, size });
    }
  }
  return { toCreate, alreadyExist };
}
