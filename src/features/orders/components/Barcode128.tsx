import { encodeCode128 } from "@/features/orders/utils/code128";

export interface Barcode128Props {
  /** The value to encode — the RobertJ `order_number`. */
  value: string;
  /** Pixel width of a single module (bar unit). */
  moduleWidth?: number;
  /** Bar height in pixels. */
  height?: number;
  /** Show the human-readable value beneath the bars. */
  showText?: boolean;
  /**
   * Stretch the bars to the full width of the container (height stays fixed)
   * instead of a fixed pixel width. On the shipping label the fixed width was
   * wider than the label and got squeezed down, making the bars thin; filling
   * the available width keeps them as wide as the label allows. The label's
   * own padding provides the quiet zone, so none is added inside the SVG.
   */
  fullWidth?: boolean;
}

/**
 * Renders a Code 128 barcode as self-contained inline SVG (no external assets,
 * no dependency) — safe for the print-isolated shipping label. If the value
 * can't be encoded it falls back to plain monospace text so the label never
 * breaks. This is display-only; scanning is handled by the scanner modal.
 */
export function Barcode128({
  value,
  moduleWidth = 2,
  height = 56,
  showText = true,
  fullWidth = false,
}: Barcode128Props) {
  let encoding;
  try {
    encoding = encodeCode128(value, { quietModules: fullWidth ? 0 : undefined });
  } catch {
    return (
      <p className="font-mono text-sm font-bold tracking-widest text-black">{value}</p>
    );
  }

  const pxWidth = encoding.totalModules * moduleWidth;

  return (
    <div className={fullWidth ? "flex w-full flex-col items-start gap-1" : "flex flex-col items-start gap-1"}>
      <svg
        width={fullWidth ? "100%" : pxWidth}
        height={height}
        viewBox={`0 0 ${encoding.totalModules} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Barcode for order ${value}`}
        shapeRendering="crispEdges"
        className="max-w-full"
      >
        <rect x={0} y={0} width={encoding.totalModules} height={height} fill="#ffffff" />
        {encoding.bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y={0}
            width={bar.width}
            height={height}
            fill="#000000"
          />
        ))}
      </svg>
      {showText ? (
        <span className="font-mono text-xs font-semibold tracking-[0.2em] text-black">
          {value}
        </span>
      ) : null}
    </div>
  );
}
