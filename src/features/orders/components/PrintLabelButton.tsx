"use client";

import { Button } from "@/components/ui/button";

export interface PrintLabelButtonProps {
  /** Button copy — the seller's shipping label and the buyer's receipt share this one trigger. */
  label?: string;
}

/**
 * Triggers the browser's native print dialog for whatever `data-print-root`
 * is on the page (shipping label or buyer receipt). Marked `.no-print` so the
 * button itself never appears on the printout. No PDF library — plain HTML
 * printed via `window.print()`.
 */
export function PrintLabelButton({ label = "Print label" }: PrintLabelButtonProps) {
  return (
    <Button
      type="button"
      variant="primary"
      size="rjSm"
      className="no-print"
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
