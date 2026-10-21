"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

export interface PaymentAttentionStripProps {
  staleCount: number;
}

/**
 * Admin-only summary strip above the Payments table — "N payments need
 * reconciliation" — surfaced before the table rather than only as a per-row
 * badge. Its button sets `staleOnly` in the URL, the same param the panel
 * reads.
 */
export function PaymentAttentionStrip({ staleCount }: PaymentAttentionStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (staleCount === 0) return null;

  const active = searchParams.get("staleOnly") === "true";

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) params.delete("staleOnly");
    else params.set("staleOnly", "true");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
      <span aria-hidden="true" className="text-warning">⚠</span>
      <p className="flex-1 text-sm font-semibold text-foreground">
        {staleCount} online payment{staleCount === 1 ? "" : "s"} need{staleCount === 1 ? "s" : ""} reconciliation
      </p>
      <Button type="button" variant="outline" size="rjSm" onClick={toggle} className="text-foreground">
        {active ? "Show all payments" : "Show only these"}
      </Button>
    </div>
  );
}
