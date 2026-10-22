import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { getTopProducts } from "@/lib/supabase/queries";

import { TOP_PRODUCTS_LIMIT } from "../constants/report.constants";
import type { ReportFilters, TopProduct } from "../types/report.types";

/**
 * Best-selling products by units placed in the range; revenue reflects the
 * paid subset (consistent with the revenue KPI).
 */
export async function TopProductsPanel({ filters }: { filters: ReportFilters }) {
  let products: TopProduct[];
  try {
    products = await getTopProducts(
      filters.from,
      filters.to,
      TOP_PRODUCTS_LIMIT,
      filters.shopId,
    );
  } catch {
    return <ErrorState message="We couldn't load top products right now." />;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Top products
        </p>
        {products.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="py-2 px-3 text-right font-medium">
                    Units
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.productId} className="border-b border-table-divider last:border-0">
                    <td className="py-2 pr-3 text-foreground">{p.productTitle}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                      {p.unitsSold}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-foreground">
                      {formatCurrency(p.revenueCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No sales yet"
            description="Products will rank here once orders are placed in this range."
          />
        )}
      </CardContent>
    </Card>
  );
}
