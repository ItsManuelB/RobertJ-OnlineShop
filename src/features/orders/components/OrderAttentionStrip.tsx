"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface OrderAttentionStripProps {
  needsConfirmation: number;
  codAwaitingCollection: number;
  /** F-10: refunded returns whose item condition was never recorded — stock stays un-restored until someone does. Not part of the `attentionOnly` order filter (it's a return_requests count, not an orders one), so its own link just points at `returnsHref`. */
  returnsAwaitingRestock: number;
  /** Where "Review returns" should link — admin's returns queue, or (seller) the orders list, since sellers record condition inline per-order rather than from a dedicated list. */
  returnsHref: string;
}

/**
 * Summary strip surfaced above the Orders table — "N orders need
 * confirmation / N COD deliveries awaiting cash collection / N returns
 * awaiting restock" — so the count is visible without first toggling a
 * filter. The first two toggle `attentionOnly` in the URL (the same param
 * `DashboardOrdersPanel` reads); the returns count instead links straight to
 * where it's resolved, since it isn't an `orders` filter at all.
 */
export function OrderAttentionStrip({
  needsConfirmation,
  codAwaitingCollection,
  returnsAwaitingRestock,
  returnsHref,
}: OrderAttentionStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (needsConfirmation === 0 && codAwaitingCollection === 0 && returnsAwaitingRestock === 0) return null;

  const active = searchParams.get("attentionOnly") === "true";

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) params.delete("attentionOnly");
    else params.set("attentionOnly", "true");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const hasOrderAttention = needsConfirmation > 0 || codAwaitingCollection > 0;

  const parts: string[] = [];
  if (needsConfirmation > 0) {
    parts.push(`${needsConfirmation} order${needsConfirmation === 1 ? "" : "s"} need${needsConfirmation === 1 ? "s" : ""} confirmation`);
  }
  if (codAwaitingCollection > 0) {
    const noun = codAwaitingCollection === 1 ? "delivery" : "deliveries";
    parts.push(`${codAwaitingCollection} COD ${noun} awaiting cash collection`);
  }
  if (returnsAwaitingRestock > 0) {
    const noun = returnsAwaitingRestock === 1 ? "return" : "returns";
    parts.push(`${returnsAwaitingRestock} refunded ${noun} awaiting restock`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
      <span aria-hidden="true">⚠</span>
      <p className="flex-1 text-sm font-semibold text-foreground">{parts.join(" · ")}</p>
      {hasOrderAttention ? (
        <Button type="button" variant="outline" size="rjSm" onClick={toggle}>
          {active ? "Show all orders" : "Show only these"}
        </Button>
      ) : null}
      {returnsAwaitingRestock > 0 ? (
        <Link href={returnsHref} className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}>
          Review returns
        </Link>
      ) : null}
    </div>
  );
}
