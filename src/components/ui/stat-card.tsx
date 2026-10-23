import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export interface StatCardProps {
  /**
   * Makes the tile clickable (Admin/Seller KPI rows). Omitted = a plain tile (Reports). With `action`, the
   * label becomes a stretched link covering the tile and the action sits above it, so no button nests in a link.
   */
  href?: string;
  label: string;
  value: ReactNode;
  /** Icon chip — all three of icon/iconBg/iconColor are needed together to render it. Omitted = no icon (Reports). */
  icon?: React.ComponentType<{ className?: string }>;
  iconBg?: string;
  iconColor?: string;
  /** Optional secondary line under the label — e.g. "Paid orders only". */
  hint?: string;
  /** Optional control in the tile's top-right corner (e.g. an info button). */
  action?: ReactNode;
  /** Visually emphasises the tile (headline metric). */
  emphasis?: boolean;
}

/**
 * Shared KPI/metric tile — used by the Admin and Seller dashboards' KPI rows
 * (icon chip, Link-wrapped) and the Reports sales summary (no icon, no link).
 * Theme-aware (generic tokens only), so it repaints correctly under the
 * Admin/Seller dark-mode toggle.
 */
export function StatCard({ href, label, value, icon: Icon, iconBg, iconColor, hint, action, emphasis = false }: StatCardProps) {
  const stretched = Boolean(href && action);
  const body = (
    <div
      className={cn(
        "relative h-full rounded-xl border p-5 transition-shadow hover:shadow-md",
        emphasis ? "border-primary bg-primary/5" : "border-border bg-card",
        action && "pr-12",
        stretched && "focus-within:ring-2 focus-within:ring-ring/40",
      )}
    >
      {action ? <div className={cn("absolute right-3 top-3", stretched && "z-10")}>{action}</div> : null}
      {Icon ? (
        <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
        </div>
      ) : null}
      <div className="mb-1 truncate text-2xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </div>
      <div className="text-xs text-muted-foreground">
        {stretched && href ? (
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            {label}
          </Link>
        ) : (
          label
        )}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );

  return href && !stretched ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
