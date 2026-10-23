/**
 * Dependency-free Code 128 (Set B) encoder for the RobertJ internal order
 * barcode. Encodes an `order_number` (e.g. "ORD-20260925-000247") into a bar
 * layout the `Barcode128` component renders as inline SVG. No external library
 * — Set B alone covers the order-number charset (uppercase, digits, hyphen).
 *
 * This is purely a *rendering* helper. Decoding/scanning is handled separately
 * by `@zxing/browser` (dynamically imported in the scanner modal).
 */

/**
 * Canonical Code 128 symbol → module-width patterns (values 0–106). Each string
 * is the run-length of alternating bar/space modules starting with a bar; the
 * final entry (106, Stop) has the 7-element termination. Index 104 = Start B.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
] as const;

const START_B = 104;
const STOP = 106;
/** Quiet zone in modules on each side (spec minimum is 10). */
const QUIET_MODULES = 10;

export interface Code128Bar {
  /** Left offset in modules (quiet zone included). */
  x: number;
  /** Bar width in modules. */
  width: number;
}

export interface Code128Encoding {
  bars: Code128Bar[];
  /** Total width in modules, including both quiet zones. */
  totalModules: number;
}

/**
 * Encodes `value` as Code 128 Set B. Throws if a character is outside the
 * printable ASCII range Set B supports (32–126) — callers rendering a UI should
 * catch and fall back to plain text.
 */
export function encodeCode128B(value: string): Code128Encoding {
  if (value.length === 0) {
    throw new Error("Cannot encode an empty value as Code 128.");
  }

  const dataValues: number[] = [];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Character "${char}" is not supported by Code 128 Set B.`);
    }
    dataValues.push(code - 32);
  }

  // Symbol sequence: Start B, data, checksum, Stop.
  let checksum = START_B;
  dataValues.forEach((v, index) => {
    checksum += v * (index + 1);
  });
  checksum %= 103;

  const symbols = [START_B, ...dataValues, checksum, STOP];

  const bars: Code128Bar[] = [];
  let x = QUIET_MODULES;
  for (const symbol of symbols) {
    const pattern = PATTERNS[symbol];
    let isBar = true;
    for (const widthChar of pattern) {
      const width = Number(widthChar);
      if (isBar) bars.push({ x, width });
      x += width;
      isBar = !isBar;
    }
  }

  return { bars, totalModules: x + QUIET_MODULES };
}

const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
/** Digit runs at least this long switch to Set C, which packs two digits into one symbol. */
const MIN_SET_C_DIGITS = 4;

export interface Code128Options {
  /** Quiet zone in modules on each side; the default is the spec minimum. Pass 0 when the surrounding layout already provides white space. */
  quietModules?: number;
}

/**
 * Code 128 encoder that switches between Set B and Set C: long digit runs
 * (the date and sequence in `ORD-20261023-000123`) use Set C, two digits per
 * symbol, so the same order number needs about 25% fewer modules than
 * `encodeCode128B`. Fewer modules means wider bars on a label of the same
 * width, which phone cameras read more easily.
 */
export function encodeCode128(value: string, options: Code128Options = {}): Code128Encoding {
  if (value.length === 0) {
    throw new Error("Cannot encode an empty value as Code 128.");
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Character "${char}" is not supported by Code 128.`);
    }
  }
  const quiet = options.quietModules ?? QUIET_MODULES;

  // Split into Set B text and Set C digit runs (an odd run keeps its first digit in B).
  const segments: Array<{ set: "B" | "C"; text: string }> = [];
  const append = (set: "B" | "C", text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.set === set) last.text += text;
    else segments.push({ set, text });
  };
  for (const part of value.match(/\d+|\D+/g) ?? []) {
    if (/^\d+$/.test(part) && part.length >= MIN_SET_C_DIGITS) {
      const odd = part.length % 2;
      append("B", part.slice(0, odd));
      append("C", part.slice(odd));
    } else {
      append("B", part);
    }
  }

  const symbols: number[] = [segments[0].set === "C" ? START_C : START_B];
  segments.forEach((segment, index) => {
    if (index > 0) symbols.push(segment.set === "C" ? CODE_C : CODE_B);
    if (segment.set === "C") {
      for (let i = 0; i < segment.text.length; i += 2) symbols.push(Number(segment.text.slice(i, i + 2)));
    } else {
      for (const char of segment.text) symbols.push(char.charCodeAt(0) - 32);
    }
  });

  let checksum = symbols[0];
  for (let i = 1; i < symbols.length; i += 1) checksum += symbols[i] * i;
  symbols.push(checksum % 103, STOP);

  const bars: Code128Bar[] = [];
  let x = quiet;
  for (const symbol of symbols) {
    let isBar = true;
    for (const widthChar of PATTERNS[symbol]) {
      const width = Number(widthChar);
      if (isBar) bars.push({ x, width });
      x += width;
      isBar = !isBar;
    }
  }

  return { bars, totalModules: x + quiet };
}
