import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { InventoryDataTable } from "@/features/inventory/components/InventoryDataTable";
import { dashboardInventoryListParamsSchema } from "@/features/inventory/schemas/inventory.schema";
import { listDashboardInventoryPage } from "@/lib/supabase/queries";

export interface InventoryTableProps {
  searchParams: Record<string, string | string[] | undefined>;
  isAdmin: boolean;
}

/**
 * `/seller/inventory` and `/admin/inventory`'s list. Reads its own
 * `searchParams` and fetches a paginated/filtered page directly — mirrors
 * `DashboardProductsPanel`/`DashboardOrdersPanel`'s exact shape. RLS already
 * scopes rows to the caller's own shop(s), or every shop for an admin.
 */
export async function InventoryTable({ searchParams, isAdmin }: InventoryTableProps) {
  const parsed = dashboardInventoryListParamsSchema.safeParse(searchParams);
  if (!parsed.success) {
    return <ErrorState message="Those filters aren't valid. Try clearing your search." />;
  }

  let result: Awaited<ReturnType<typeof listDashboardInventoryPage>>;
  try {
    result = await listDashboardInventoryPage(parsed.data);
  } catch {
    return <ErrorState message="We couldn't load inventory right now." />;
  }

  const { items, page, totalPages, total } = result;
  const rawView = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  const groupByShop = isAdmin && rawView !== "flat";

  if (items.length === 0) {
    const filtering = Boolean(parsed.data.search || parsed.data.stockStatus || (isAdmin && parsed.data.shopId));
    return (
      <EmptyState
        title={filtering ? "No matching stock rows" : "No stock to manage yet"}
        description={
          filtering
            ? "Try a different search term or clear a filter."
            : "Inventory rows are created automatically for every product."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {items.length} row{items.length === 1 ? "" : "s"} on this page · {total} matching row
        {total === 1 ? "" : "s"} total
      </p>
      <InventoryDataTable items={items} isAdmin={isAdmin} groupByShop={groupByShop} />
      {totalPages > 1 ? <PaginationControls page={page} totalPages={totalPages} themed /> : null}
    </div>
  );
}
