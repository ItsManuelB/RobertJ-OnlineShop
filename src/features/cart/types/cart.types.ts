export interface CartItem {
  productId: string;
  /**
   * Present only when this line is a specific color/size variant. A cart
   * line's real identity is `productId` + `variantId` (see `getCartLineKey`),
   * not `productId` alone — the same product can appear as several distinct
   * lines, one per variant. Absent (not `null`) for a plain product, which
   * also keeps every pre-Phase-3c localStorage cart working unchanged: an
   * old line simply has no `variantId` key at all.
   */
  variantId?: string;
  /** Snapshot display label for the selected variant (e.g. "Blue / M"), or omitted/null for a plain product. */
  variantLabel?: string | null;
  slug: string;
  title: string;
  imageUrl: string | null;
  unitPriceCents: number;
  currency: string;
  quantity: number;
  /** Stock at the time of adding, used to cap quantity in the UI. */
  maxQuantity: number;
  /**
   * Carried so checkout can group the cart by seller. The schema models one
   * order per seller, so a mixed cart becomes several orders. Null only for
   * a server-authoritative (signed-in) cart line whose product's seller
   * account has since been permanently deleted — `groupCartBySeller`/
   * checkout treat such a line as unavailable, matching `create_order`'s
   * server-side guard.
   */
  sellerId: string | null;
  /**
   * Seller display name, carried so checkout can label order groups. Older
   * carts may lack it (localStorage migration note) — treat as null.
   */
  sellerName: string | null;
}

export interface CartState {
  items: CartItem[];
}

/** Identifies one cart line — a plain product has no `variantId`. */
export interface CartLineRef {
  productId: string;
  variantId?: string;
}

export type CartAction =
  | { type: "add"; item: CartItem }
  | ({ type: "remove" } & CartLineRef)
  | { type: "removeMany"; lines: CartLineRef[] }
  | ({ type: "setQuantity"; quantity: number } & CartLineRef)
  /**
   * Applies a server-confirmed price/stock correction to one line. Requires
   * an explicit user action (e.g. clicking "Update") — never dispatched
   * automatically just because a mismatch was detected.
   */
  | ({
      type: "updateItem";
      patch: Partial<Pick<CartItem, "unitPriceCents" | "maxQuantity">>;
    } & CartLineRef)
  | { type: "clear" }
  | { type: "hydrate"; state: CartState };

/** Outcome of `addItemChecked` — the buyer-facing message is always safe to display as is. */
export type CartAddResult =
  | { success: true; quantityInCart: number }
  | { success: false; error: string };
