/**
 * Minimal QR Code encoder for short text (byte mode, error correction M,
 * versions 1-3: up to 42 bytes), enough for a RobertJ order number. Pure and
 * dependency-free, like `code128.ts`, so the print-isolated shipping label
 * stays self-contained. Throws when the text doesn't fit; callers fall back
 * to omitting the QR (the Code 128 and printed number remain).
 */

export interface QrMatrix {
  /** Modules per side (21, 25 or 29), quiet zone not included. */
  size: number;
  /** `modules[row][column]` is true for a dark module. */
  modules: boolean[][];
}

/** Error-correction level M data/EC codeword counts per version (all single-block). */
const VERSIONS = [
  { version: 1, dataCodewords: 16, eccCodewords: 10, capacity: 14 },
  { version: 2, dataCodewords: 28, eccCodewords: 16, capacity: 26 },
  { version: 3, dataCodewords: 44, eccCodewords: 26, capacity: 42 },
] as const;

/** Level M's two format-information bits are 00. */
const ECC_M_BITS = 0;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMultiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Reed-Solomon remainder of `data` divided by the degree-`degree` generator polynomial. */
function reedSolomon(data: number[], degree: number): number[] {
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMultiply(generator[j], GF_EXP[i]);
    }
    generator = next;
  }
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) result[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return result;
}

function toCodewords(bytes: number[], dataCodewords: number): number[] {
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);
  const capacityBits = dataCodewords * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  for (let pad = 0xec; codewords.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) codewords.push(pad);
  return codewords;
}

function maskApplies(mask: number, row: number, column: number): boolean {
  switch (mask) {
    case 0: return (row + column) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return column % 3 === 0;
    case 3: return (row + column) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    case 5: return ((row * column) % 2) + ((row * column) % 3) === 0;
    case 6: return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    default: return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
  }
}

/** 15-bit format information (BCH-protected, masked) for error level M and a mask pattern. */
function formatBits(mask: number): number {
  const data = (ECC_M_BITS << 3) | mask;
  let remainder = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((remainder >>> i) & 1) remainder ^= 0x537 << (i - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

/** Standard QR penalty score (lower reads better); used only to pick the mask. */
function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;

  const lines: boolean[][] = [];
  for (let i = 0; i < size; i += 1) {
    lines.push(modules[i]);
    lines.push(modules.map((row) => row[i]));
  }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= line.length; i += 1) {
      if (i < line.length && line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    const text = line.map((dark) => (dark ? "1" : "0")).join("");
    for (const pattern of ["10111010000", "00001011101"]) {
      let at = text.indexOf(pattern);
      while (at !== -1) {
        score += 40;
        at = text.indexOf(pattern, at + 1);
      }
    }
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const dark = modules[r][c];
      if (dark === modules[r][c + 1] && dark === modules[r + 1][c] && dark === modules[r + 1][c + 1]) score += 3;
    }
  }

  const darkCount = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const percent = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

export function encodeQr(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  const spec = VERSIONS.find((candidate) => bytes.length <= candidate.capacity);
  if (!spec) throw new Error("Text is too long for this QR encoder.");

  const data = toCodewords(bytes, spec.dataCodewords);
  const codewords = [...data, ...reedSolomon(data, spec.eccCodewords)];

  const size = 17 + 4 * spec.version;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFunction = (row: number, column: number, dark: boolean) => {
    modules[row][column] = dark;
    reserved[row][column] = true;
  };

  // Finder patterns with their one-module separators.
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const row = top + dr;
        const column = left + dc;
        if (row < 0 || row >= size || column < 0 || column >= size) continue;
        const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        setFunction(row, column, ring !== 2 && ring !== 4);
      }
    }
  }
  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  // Alignment pattern (versions 2 and 3 have exactly one, at the bottom right).
  if (spec.version >= 2) {
    const center = size - 7;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        setFunction(center + dr, center + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }
  }
  // Reserve the format areas (written per mask) and the always-dark module.
  for (let i = 0; i < 9; i += 1) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  setFunction(size - 8, 8, true);

  // Data bits, zig-zagging up and down column pairs from the bottom right.
  const bits: boolean[] = [];
  for (const codeword of codewords) for (let i = 7; i >= 0; i -= 1) bits.push(((codeword >>> i) & 1) === 1);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset;
        const goingUp = (((right + 1) & 2) === 0);
        const row = goingUp ? size - 1 - vertical : vertical;
        if (reserved[row][column]) continue;
        modules[row][column] = bitIndex < bits.length ? bits[bitIndex] : false;
        bitIndex += 1;
      }
    }
  }

  // Pick the mask with the lowest penalty.
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => row.slice());
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (!reserved[row][column] && maskApplies(mask, row, column)) candidate[row][column] = !candidate[row][column];
      }
    }
    const format = formatBits(mask);
    const bit = (i: number) => ((format >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i += 1) candidate[i][8] = bit(i);
    candidate[7][8] = bit(6);
    candidate[8][8] = bit(7);
    candidate[8][7] = bit(8);
    for (let i = 9; i < 15; i += 1) candidate[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i += 1) candidate[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i += 1) candidate[size - 15 + i][8] = bit(i);
    candidate[size - 8][8] = true;

    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return { size, modules: best ?? modules };
}
