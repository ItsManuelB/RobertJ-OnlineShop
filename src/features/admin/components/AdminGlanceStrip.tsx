import Link from "next/link";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/constants/routes";
import {
  getLowStockReport,
  getProductCount,
  getSalesSummary,
  listShops,
} from "@/lib/supabase/queries";

export interface AdminGlanceStripProps {
  from: string;
  to: string;
}

/** "Marketplace at a glance": the platform counts that aren't about sales, each linking to where it is managed. */
export async function AdminGlanceStrip({ from, to }: AdminGlanceStripProps) {
  let items: Array<{ label: string; value: number; href: string }>;
  try {
    const [shops, productCount, lowStock, summary] = await Promise.all([
      listShops(),
      getProductCount(null),
      getLowStockReport(),
      getSalesSummary(from, to, null),
    ]);
    items = [
      { label: "Active shops", value: shops.filter((shop) => shop.active).length, href: ROUTES.adminShops },
      { label: "Products live", value: productCount, href: ROUTES.adminProducts },
      { label: "Low or out of stock", value: lowStock.length, href: ROUTES.adminInventory },
      { label: "Online payments paid", value: summary.xenditPaidOrders, href: ROUTES.adminPayments },
    ];
  } catch {
    return <ErrorState message="We couldn't load the marketplace counts right now." />;
  }

  return (
    <section aria-label="Marketplace at a glance">
      <h2 className="mb-2 text-sm font-semibold text-foreground">Marketplace at a glance</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted px-4 py-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-col">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              <Link href={item.href} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                {item.value}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function AdminGlanceStripSkeleton() {
  return <Skeleton className="h-16 w-full rounded-xl" />;
}
