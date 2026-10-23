/**
 * Database Table Configuration
 * Single source of truth for all Supabase table names.
 *
 * Usage:
 *   import { DATABASE_TABLES } from "@/constants/database";
 *   supabase.from(DATABASE_TABLES.PRODUCTS)
 *
 * Table names appear only here and in `supabase/migrations/*.sql`. Every query
 * in `lib/supabase/queries.ts` references this constant instead of a literal
 * string, so a table rename is a one-line change instead of a repo-wide
 * find-and-replace, and a typo becomes a compile error instead of a silent
 * runtime "relation does not exist".
 */

export const DATABASE_TABLES = {
  PROFILES: "profiles",
  CATEGORIES: "categories",
  CATEGORY_ATTRIBUTES: "category_attributes",
  PRODUCTS: "products",
  PRODUCT_IMAGES: "product_images",
  ORDERS: "orders",
  ORDER_ITEMS: "order_items",
  ORDER_SHIPMENTS: "order_shipments",
  PAYMENTS: "payments",
  SHOPS: "shops",
  SHOP_USERS: "shop_users",
  INVENTORY: "inventory",
  STOCK_ADJUSTMENTS: "stock_adjustments",
  ADMIN_ACTION_LOG: "admin_action_log",
  PLATFORM_SETTINGS: "platform_settings",
  WISHLISTS: "wishlists",
  REVIEWS: "reviews",
  RETURN_REQUESTS: "return_requests",
  ADDRESSES: "addresses",
  PRODUCT_VARIANTS: "product_variants",
  CARTS: "carts",
  CART_ITEMS: "cart_items",
  RECOMMENDATION_RULES: "recommendation_rules",
  BUYER_PREFERENCES: "buyer_preferences",
  XENDIT_REFUNDS: "xendit_refunds",
  CANCELLATION_REQUESTS: "cancellation_requests",
  /** View, not a table — computed lifecycle bucket per order for the buyer `/orders` tabs. See its migration for the precedence rules. */
  BUYER_ORDER_LIFECYCLE: "buyer_order_lifecycle",
} as const;

/** Union of every table name in the schema. */
export type DatabaseTable = (typeof DATABASE_TABLES)[keyof typeof DATABASE_TABLES];

/**
 * Not used inside `.select()` embedded-resource strings (e.g.
 * `seller:profiles!products_seller_id_fkey`) — those are parsed by Supabase's
 * generated types at the type level and must stay literal, or the inferred
 * row shape is lost. Reach for `DATABASE_TABLES.X` directly instead of
 * interpolating into a select string; see the comment above `PRODUCT_COLUMNS`
 * in `lib/supabase/queries.ts` for the full explanation.
 */
