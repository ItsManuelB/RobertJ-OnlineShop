import { cn } from "@/lib/utils/cn";

export interface DeltaBadgeProps {
  current: number;
  previous: number;
  /** For metrics where a drop is good (e.g. refunds): swaps the success/danger tones. */
  invert?: boolean;
}

/**
 * Period-over-period "▲ 12%" / "▼ 3%" chip for a KPI value. Renders nothing
 * for a negligible (<1%) change or when both periods are zero, so a quiet
 * metric doesn't manufacture noise.
 */
export function DeltaBadge({ current, previous, invert = false }: DeltaBadgeProps) {
  if (previous === 0) {
    if (current === 0) return null;
    return (
      <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-bold text-success">
        New
      </span>
    );
  }

  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 1) return null;

  const up = pct > 0;
  const good = invert ? !up : up;
  const magnitude = Math.abs(Math.round(pct));
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
        good ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
      )}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"} {magnitude}%</span>
      <span className="sr-only">{up ? "up" : "down"} {magnitude}% versus the previous period</span>
    </span>
  );
}
