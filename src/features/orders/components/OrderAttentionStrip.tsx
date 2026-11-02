"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils/cn";

export interface OrderAttentionStripProps {
  needsConfirmation: number;
  /** Orders confirmed and waiting to be packed (the "To Pack" stage). */
  toPack: number;
  codAwaitingCollection: number;
  /** F-10: refunded returns whose item condition was never recorded — stock stays un-restored until someone does. Not part of the `attentionOnly` order filter (it's a return_requests count, not an orders one), so its own link just points at `returnsHref`. */
  returnsAwaitingRestock: number;
  /** Orders confirmed/processing for too long without shipping. Optional (the admin watches it platform-wide; the seller sees it on their Dashboard). */
  overdueToShip?: number;
  /** The orders list these cards filter (the seller's or the admin's). */
  ordersHref: string;
  /** Where COD cash is recorded — Payments, not an orders filter. */
  paymentsHref: string;
  /** Where "Review returns" should link — the admin's or the seller's own returns queue, which is where the restock decision is recorded. */
  returnsHref: string;
}

interface StepCard {
  key: string;
  count: number;
  label: string;
  cta: string;
  href: string;
  danger?: boolean;
}

const CARD =
  "flex h-full flex-col gap-0.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * Next-step cards above the Orders table — what is waiting on the seller,
 * by stage: confirm, pack, collect COD cash, restock returns. Each card is a
 * link to where that work happens (a filtered orders list, Payments, or
 * Returns), and shows only when its count is above zero. "Show only orders
 * needing action" still toggles `attentionOnly` in the URL, the same param
 * `DashboardOrdersPanel` reads.
 */
export function OrderAttentionStrip({
  needsConfirmation,
  toPack,
  codAwaitingCollection,
  returnsAwaitingRestock,
  overdueToShip = 0,
  ordersHref,
  paymentsHref,
  returnsHref,
}: OrderAttentionStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const cards: StepCard[] = [
    {
      key: "confirm",
      count: needsConfirmation,
      label: needsConfirmation === 1 ? "Needs confirmation" : "Need confirmation",
      cta: "Review →",
      href: `${ordersHref}?status=pending&confirmationRequired=true`,
    },
    {
      key: "overdue",
      count: overdueToShip,
      label: "Overdue to ship",
      cta: "Open To Pack →",
      href: `${ordersHref}?status=confirmed`,
      danger: true,
    },
    { key: "pack", count: toPack, label: "Ready to pack", cta: "Open To Pack →", href: `${ordersHref}?status=confirmed` },
    { key: "cod", count: codAwaitingCollection, label: "COD cash to collect", cta: "Open Payments →", href: paymentsHref },
    { key: "returns", count: returnsAwaitingRestock, label: "Returns to restock", cta: "Review returns →", href: returnsHref },
  ].filter((card) => card.count > 0);

  if (cards.length === 0) return null;

  const active = searchParams.get("attentionOnly") === "true";
  const hasOrderAttention = needsConfirmation > 0 || codAwaitingCollection > 0;

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) params.delete("attentionOnly");
    else params.set("attentionOnly", "true");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next steps</h2>
        {hasOrderAttention ? (
          <button
            type="button"
            onClick={toggle}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            {active ? "Show all orders" : "Show only orders needing action"}
          </button>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {cards.map((card) => (
          <li key={card.key} className="min-w-0">
            <Link href={card.href} className={cn(CARD)}>
              <span className={cn("text-2xl font-semibold tabular-nums", card.danger ? "text-destructive" : "text-primary")}>{card.count}</span>
              <span className="text-sm font-semibold text-foreground">{card.label}</span>
              <span className="mt-1 text-xs font-semibold text-primary">{card.cta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
