"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface OrderMessageButtonProps {
  orderId: string;
  /** Button copy — e.g. "Contact Seller" (buyer) / "Message buyer" (seller). */
  label?: string;
  /** Use the portal outline variant instead of the buyer's rj outline. */
  themed?: boolean;
}

/**
 * Opens the global messages inbox focused on this order, via a `?chat=<orderId>`
 * query the mounted `GlobalInboxDock` reacts to. Replaces the old per-order chat
 * dock on the order-detail pages — there is now a single inbox surface.
 */
export function OrderMessageButton({ orderId, label = "Message", themed = false }: OrderMessageButtonProps) {
  const pathname = usePathname();
  return (
    <Link
      href={`${pathname}?chat=${orderId}`}
      scroll={false}
      className={cn(buttonVariants({ variant: themed ? "outline" : "rjOutline", size: "rjSm" }))}
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
