import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { MyShopWorkspace } from "@/features/shops/components/MyShopWorkspace";
import type { Shop } from "@/features/shops/types/shop.types";

export interface MyShopPanelProps {
  shop: Shop;
}

/**
 * Seller-facing shop branding editor: logo, banner, and description only —
 * name/slug/active status are shown read-only (admin-owned), and Featured
 * placement isn't shown or controllable here at all: it's a system-computed
 * ranking that branding never influences (see `getFeaturedShops`).
 *
 * The page header lives here (server); the editors and the live buyer preview
 * share state in `MyShopWorkspace` (client).
 */
export function MyShopPanel({ shop }: MyShopPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Shop</h1>
          <p className="text-sm text-muted-foreground">
            Edit what buyers see on your shop page. Homepage placement is set automatically from
            your shop&apos;s activity.
          </p>
        </div>
        <Link
          href={ROUTES.shopCatalog(shop.id)}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View public shop
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <MyShopWorkspace shop={shop} />
    </div>
  );
}
