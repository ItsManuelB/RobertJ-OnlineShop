import Link from "next/link";
import { BarChart3, Boxes, Plus, ShoppingBag } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils/cn";

const ACTIONS = [
  { href: ROUTES.sellerProductNew, label: "Add product", icon: Plus, primary: true },
  { href: `${ROUTES.sellerOrders}?confirmationRequired=true`, label: "Process orders", icon: ShoppingBag, primary: false },
  { href: ROUTES.sellerInventory, label: "Update stock", icon: Boxes, primary: false },
  { href: ROUTES.sellerReports, label: "Full reports", icon: BarChart3, primary: false },
] as const;

/** Header shortcuts into established Seller workflows. Plain links, no data. */
export function SellerQuickActions({ reportsQuery }: { reportsQuery?: string }) {
  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const href =
          action.href === ROUTES.sellerReports && reportsQuery ? `${action.href}?${reportsQuery}` : action.href;
        return (
          <Link
            key={action.label}
            href={href}
            className={cn(
              buttonVariants({ variant: action.primary ? "primary" : "outline", size: "sm" }),
              "min-h-10 justify-center gap-2 whitespace-nowrap",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {action.label}
          </Link>
        );
      })}
    </nav>
  );
}
