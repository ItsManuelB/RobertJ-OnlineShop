import "server-only";

import { ROUTES } from "@/constants/routes";
import { formatCurrency } from "@/lib/utils/currency";
import { getCurrentSellerOwner, getLowStockReport, getOrderAttentionCounts } from "@/lib/supabase/queries";

import { SHIP_OVERDUE_DAYS } from "../constants/fulfilment";
import { buildSellerTasks, type SellerTask } from "./seller-tasks";

/**
 * The seller's current task list, scoped to their own shop. Shared by the
 * dashboard panel and the topbar bell. A seller with no shop has nothing to
 * manage, so this returns an empty list instead of an unscoped one.
 */
export async function getSellerTaskList(): Promise<SellerTask[]> {
  const owner = await getCurrentSellerOwner();
  if (!owner.shopId) return [];

  const [counts, lowStock] = await Promise.all([
    getOrderAttentionCounts(owner.shopId),
    getLowStockReport(owner.shopId),
  ]);

  return buildSellerTasks(
    {
      ...counts,
      outOfStock: lowStock.filter((item) => item.stockStatus === "out_of_stock").length,
      lowStock: lowStock.filter((item) => item.stockStatus === "low_stock").length,
    },
    { orders: ROUTES.sellerOrders, returns: ROUTES.sellerReturns, inventory: ROUTES.sellerInventory },
    formatCurrency,
    SHIP_OVERDUE_DAYS,
  );
}
