import { encodeQr } from "@/features/orders/utils/qr";

export interface QrCodeProps {
  /** The text to encode, the RobertJ `order_number`. */
  value: string;
  /** Rendered width and height in px (quiet zone included). */
  size?: number;
}

/**
 * Renders a QR code as self-contained inline SVG (no external assets, no
 * dependency), the same approach as `Barcode128`. QR has built-in error
 * correction, so a phone reads it from a smudged, curved or out-of-focus
 * label far more reliably than a thin 1D barcode. Falls back to nothing if
 * the value can't be encoded (the barcode and printed number remain).
 */
export function QrCode({ value, size = 104 }: QrCodeProps) {
  let matrix;
  try {
    matrix = encodeQr(value);
  } catch {
    return null;
  }

  const quiet = 4;
  const total = matrix.size + quiet * 2;
  const path: string[] = [];
  matrix.modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) path.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    });
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={`QR code for order ${value}`}
      shapeRendering="crispEdges"
      className="shrink-0"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path.join("")} fill="#000000" />
    </svg>
  );
}
