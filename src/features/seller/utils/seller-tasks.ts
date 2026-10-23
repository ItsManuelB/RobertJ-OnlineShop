/**
 * Builds the Seller Dashboard's "Needs your attention" list from counts the
 * service layer already returns. Pure and import-free on purpose: the topbar
 * bell and the dashboard panel both call it, so they can never disagree, and
 * `npm run test:unit` can run it directly under Node.
 */

export type SellerTaskTone = "info" | "warning" | "danger";

export interface SellerTaskCounts {
  needsConfirmation: number;
  codAwaitingCollection: number;
  pendingReturnRequests: number;
  returnsDueSoon: number;
  returnsAwaitingReceipt: number;
  returnsAwaitingRestock: number;
  toPrepare: number;
  inProcessing: number;
  /** Confirmed/processing orders waiting longer than the ship threshold. */
  overdueToShip: number;
  /** Cash (integer cents) still to collect on shipped/delivered COD orders. */
  codAwaitingCents: number;
  outOfStock: number;
  lowStock: number;
}

/** Destinations, passed in so this file needs no imports (callers use `ROUTES`). */
export interface SellerTaskRoutes {
  orders: string;
  returns: string;
  inventory: string;
}

export interface SellerTask {
  id: string;
  count: number;
  title: string;
  detail: string;
  /** Extra line shown in the danger colour, e.g. a deadline. */
  urgent: string | null;
  cta: string;
  href: string;
  tone: SellerTaskTone;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const defaultFormatCents = (cents: number) =>
  `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Tasks with a count above zero, most urgent first. */
export function buildSellerTasks(
  counts: SellerTaskCounts,
  routes: SellerTaskRoutes,
  formatCents: (cents: number) => string = defaultFormatCents,
  shipOverdueDays = 2,
): SellerTask[] {
  const returnsActionHref = `${routes.returns}?tab=action`;
  const tasks: SellerTask[] = [
    {
      id: "confirm-orders",
      count: counts.needsConfirmation,
      title: "Confirm new orders",
      detail: "COD orders, and online orders whose payment has gone through.",
      urgent: null,
      cta: "Review orders",
      href: `${routes.orders}?confirmationRequired=true`,
      tone: "warning",
    },
    {
      id: "return-requests",
      count: counts.pendingReturnRequests,
      title: "Respond to return requests",
      detail: "Accept or reject each request within the 3-day response window.",
      urgent:
        counts.returnsDueSoon > 0
          ? `${plural(counts.returnsDueSoon, "request")} due within 24 hours or overdue`
          : null,
      cta: "Open returns",
      href: returnsActionHref,
      tone: "danger",
    },
    {
      id: "fulfil-orders",
      count: counts.toPrepare + counts.inProcessing,
      title: "Prepare and ship",
      detail: `${counts.toPrepare} confirmed · ${counts.inProcessing} processing, waiting for shipment`,
      urgent:
        counts.overdueToShip > 0
          ? `${plural(counts.overdueToShip, "order")} waiting more than ${shipOverdueDays} days — ship these first`
          : null,
      cta: "Open orders",
      href: `${routes.orders}?status=${counts.toPrepare > 0 ? "confirmed" : "processing"}`,
      tone: counts.overdueToShip > 0 ? "danger" : "info",
    },
    {
      id: "cod-collection",
      count: counts.codAwaitingCollection,
      title: "Mark COD cash collected",
      detail: `${formatCents(counts.codAwaitingCents)} in cash to collect from ${plural(counts.codAwaitingCollection, "order")}. It counts as sales once you mark it collected.`,
      urgent: null,
      cta: "Review COD orders",
      href: `${routes.orders}?attentionOnly=true`,
      tone: "warning",
    },
    {
      id: "returned-parcels",
      count: counts.returnsAwaitingReceipt,
      title: "Confirm returned parcels",
      detail: "The buyer shipped the item back. Confirm and inspect it when it arrives.",
      urgent: null,
      cta: "Open returns",
      href: returnsActionHref,
      tone: "info",
    },
    {
      id: "return-condition",
      count: counts.returnsAwaitingRestock,
      title: "Record returned item condition",
      detail: "Mark refunded items sellable or not sellable so stock is restored correctly.",
      urgent: null,
      cta: "Open returns",
      href: returnsActionHref,
      tone: "info",
    },
    {
      id: "restock",
      count: counts.outOfStock + counts.lowStock,
      title: "Restock products",
      detail: `${counts.outOfStock} out of stock · ${counts.lowStock} running low`,
      urgent: null,
      cta: "Open inventory",
      href: `${routes.inventory}?stockStatus=${counts.outOfStock > 0 ? "out_of_stock" : "low_stock"}`,
      tone: "danger",
    },
  ];
  return tasks.filter((task) => task.count > 0);
}

/** One-line summary for the collapsed attention bar. */
export function summarizeSellerTasks(tasks: readonly SellerTask[]): string {
  if (tasks.length === 0) return "All caught up";
  const lead = tasks
    .slice(0, 3)
    .map((task) => `${task.count} ${task.title.toLowerCase()}`)
    .join(" · ");
  return tasks.length > 3 ? `${lead} · +${tasks.length - 3} more` : lead;
}
