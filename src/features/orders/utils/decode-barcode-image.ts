/** Longest image side (px) tried, in order: a phone photo is often 12 MP, which ZXing reads slowly and less reliably than a moderate size. */
const DECODE_SIZES = [1600, 1000, 700, 2400] as const;
/**
 * Rotations tried at each size (degrees). ZXing's 1D readers only cope with a
 * barcode that is nearly horizontal, but a seller's photo is often sideways
 * or tilted, so the photo is rotated to meet the reader.
 */
const DECODE_ANGLES = [0, 90, -90, 8, -8, 16, -16, 25, -25, 180] as const;

export type BarcodeImageResult = { ok: true; text: string } | { ok: false; reason: "load" | "unreadable" };

/** Minimal shape of the browser's built-in BarcodeDetector (Chromium), which isn't in the TS DOM lib. */
interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}
type NativeBarcodeDetectorCtor = new (options: { formats: string[] }) => NativeBarcodeDetector;

function loadImage(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    image.src = url;
  });
}

function drawScaled(image: HTMLImageElement, longestSide: number, angleDeg: number): HTMLCanvasElement {
  const scale = Math.min(1, longestSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * cos + height * sin));
  canvas.height = Math.max(1, Math.round(width * sin + height * cos));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("load");
  // White backdrop so a transparent PNG (or the corners a rotation exposes) doesn't decode as black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  return canvas;
}

/**
 * Reads one Code 128 barcode from a photo or screenshot, entirely in the
 * browser (the image never leaves the device). Tries the browser's native
 * BarcodeDetector first where it exists, then ZXing at several sizes with
 * the "try harder" hint, at several sizes and rotations (sideways, tilted and
 * slightly blurry photos).
 * ZXing is imported on demand so it only loads when a seller uploads.
 */
export async function decodeBarcodeFromFile(file: File): Promise<BarcodeImageResult> {
  let loaded: Awaited<ReturnType<typeof loadImage>>;
  try {
    loaded = await loadImage(file);
  } catch {
    return { ok: false, reason: "load" };
  }

  try {
    const Native = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
    if (Native) {
      try {
        const found = await new Native({ formats: ["code_128"] }).detect(loaded.image);
        const text = found[0]?.rawValue?.trim();
        if (text) return { ok: true, text };
      } catch {
        // Native detector unavailable for this image: fall through to ZXing.
      }
    }

    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);

    for (const size of DECODE_SIZES) {
      for (const angle of DECODE_ANGLES) {
        try {
          const result = reader.decodeFromCanvas(drawScaled(loaded.image, size, angle));
          const text = result.getText().trim();
          if (text) return { ok: true, text };
        } catch {
          // No barcode at this size and angle: try the next.
        }
      }
    }
    return { ok: false, reason: "unreadable" };
  } finally {
    loaded.revoke();
  }
}
