/** Shared active/idle classes for the pill-shaped status/category filter chips used across Admin/Seller/Buyer filter bars (Orders, Payments, Users, Products). Fixed rj-* palette — correct for Buyer/Marketing surfaces. */
export const FILTER_CHIP_ACTIVE =
  "rounded-full border-[1.5px] border-rj-black bg-rj-black px-4 py-2.5 text-xs lg:py-1.5 font-bold text-rj-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";
export const FILTER_CHIP_IDLE =
  "rounded-full border-[1.5px] border-rj-gray-200 bg-transparent px-4 py-2.5 text-xs lg:py-1.5 font-bold text-rj-gray-600 transition-all hover:border-rj-black hover:text-rj-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-red/30";

/** Same chip shape, resolved through the Admin/Seller portal's tokens instead — use for filter bars that only ever render inside a themed portal, or pass conditionally when the same component also renders for Buyer (see OrderStatusFilter). */
export const FILTER_CHIP_ACTIVE_THEMED =
  "rounded-full border-[1.5px] border-primary bg-primary px-4 py-2.5 text-xs lg:py-1.5 font-bold text-primary-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
export const FILTER_CHIP_IDLE_THEMED =
  "rounded-full border-[1.5px] border-border bg-transparent px-4 py-2.5 text-xs lg:py-1.5 font-bold text-muted-foreground transition-all hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
