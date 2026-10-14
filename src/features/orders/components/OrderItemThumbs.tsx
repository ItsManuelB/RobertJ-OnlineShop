import Image from "next/image";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { OrderItem } from "@/features/orders/types/order.types";

const MAX_SHOWN = 3;

/**
 * The purchased products of an order as overlapping thumbnails (first photo of
 * each line), with a "+N" tile when there are more. A line with no photo shows
 * a neutral placeholder instead of leaving a gap. Decorative: the product
 * names are always listed as text next to it, so the images carry empty alt.
 */
export function OrderItemThumbs({ items, size = "md" }: { items: OrderItem[]; size?: "sm" | "md" }) {
  const shown = items.slice(0, MAX_SHOWN);
  const extra = items.length - shown.length;
  const tile = size === "sm" ? "h-9 w-9" : "h-11 w-11";

  return (
    <div className="flex shrink-0 items-center -space-x-3" aria-hidden="true">
      {shown.map((item) => (
        <div
          key={item.id}
          className={cn("relative overflow-hidden rounded-md border-2 border-card bg-muted", tile)}
        >
          {item.imageUrl ? (
            <Image src={item.imageUrl} alt="" fill sizes="44px" className="object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Package className="h-4 w-4" />
            </span>
          )}
        </div>
      ))}
      {extra > 0 ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-md border-2 border-card bg-muted text-xs font-bold text-muted-foreground",
            tile,
          )}
        >
          +{extra}
        </div>
      ) : null}
    </div>
  );
}
