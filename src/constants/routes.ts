export const ROUTES = {
  home: "/",
  ourStory: "/our-story",
  products: "/products",
  productDetail: (slug: string) => `/products/${slug}`,
  categories: "/categories",
  categoryDetail: (slug: string) => `/categories/${slug}`,
  cart: "/cart",
  checkout: "/checkout",
  /** Checkout for one product only ("Buy now"); the cart is left untouched. Price and stock are re-read server-side. */
  checkoutBuyNow: (line: { productId: string; variantId?: string; quantity: number }) => {
    const params = new URLSearchParams({ buyNow: line.productId, qty: String(line.quantity) });
    if (line.variantId) params.set("variant", line.variantId);
    return `/checkout?${params.toString()}`;
  },
  /** Checkout-owned payment workspace for an existing order — retry, resume, or change payment method. The only place buyer payment initiation is allowed to happen; see docs/payment-ux-architecture-audit.md. */
  checkoutResume: (orderId: string) => `/checkout/resume/${orderId}`,
  /** Customer account hub (order tracking + overview). See docs/customer-account-architecture-plan.md. */
  account: "/account",
  orders: "/orders",
  orderDetail: (id: string) => `/orders/${id}`,
  orderCancellation: (id: string) => `/orders/${id}/cancellation`,
  profile: "/profile",
  addresses: "/addresses",
  wishlist: "/wishlist",
  changePassword: "/change-password",
  privacy: "/privacy",
  /** Legacy Shop Owner/Admin routes — every page under here is now a redirect
   * stub to its `/admin/*` or `/seller/*` equivalent (see `redirectToPortal`),
   * kept so old bookmarks/links keep working. Never build new features here. */
  dashboard: "/dashboard",
  dashboardProducts: "/dashboard/products",
  dashboardOrders: "/dashboard/orders",
  dashboardOrderDetail: (id: string) => `/dashboard/orders/${id}`,
  inventory: "/dashboard/inventory",
  paymentVerification: "/dashboard/payments",
  reports: "/dashboard/reports",
  /** Admin Portal — separate from the Buyer marketplace and the Seller Portal (`/seller/*`). */
  admin: "/admin",
  adminDashboard: "/admin/dashboard",
  adminProducts: "/admin/products",
  adminProductEdit: (id: string) => `/admin/products/${id}`,
  adminInventory: "/admin/inventory",
  adminOrders: "/admin/orders",
  adminOrderDetail: (id: string) => `/admin/orders/${id}`,
  adminPayments: "/admin/payments",
  /** Admin-only: sellers see their own return requests inline on their own orders, not this queue. */
  adminReturns: "/admin/returns-refunds",
  adminReports: "/admin/reports",
  /** Admin-only sections — distinct from the (nonexistent) `shops` table. */
  adminUsers: "/admin/users",
  adminUserDetail: (id: string) => `/admin/users/${id}`,
  adminShops: "/admin/shops",
  adminCategories: "/admin/categories",
  adminAuditLog: "/admin/audit-log",
  adminSettings: "/admin/settings",
  /** Seller Portal — separate from the `/dashboard` tree, mirrors the Admin Portal split. */
  seller: "/seller",
  sellerDashboard: "/seller/dashboard",
  sellerShop: "/seller/shop",
  sellerSettings: "/seller/settings",
  sellerProducts: "/seller/products",
  sellerProductNew: "/seller/products/new",
  sellerProductEdit: (id: string) => `/seller/products/${id}`,
  sellerInventory: "/seller/inventory",
  sellerOrders: "/seller/orders",
  sellerOrderDetail: (id: string) => `/seller/orders/${id}`,
  sellerOrderLabel: (id: string) => `/seller/orders/${id}/label`,
  sellerPayments: "/seller/payments",
  sellerReports: "/seller/reports",
  notifications: "/notifications",
  assistant: "/assistant",
  signIn: "/sign-in",
  signUp: "/sign-up",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  /** OAuth / email-link (PKCE) exchange endpoint. Not a page. */
  authCallback: "/auth/callback",
} as const;

/**
 * Routes that require an authenticated session. `/cart` is intentionally NOT
 * here — it is a public, client-side guest cart (`features/cart` persisted to
 * localStorage); only the routes that commit the cart or expose an account
 * (checkout, orders, notifications, dashboard, profile) are gated.
 */
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/admin",
  "/seller",
  "/account",
  "/orders",
  "/checkout",
  "/notifications",
  "/profile",
  "/addresses",
  "/wishlist",
  "/change-password",
  "/privacy",
] as const;

/** Routes an authenticated user should be redirected away from. */
export const AUTH_ROUTES = ["/sign-in", "/sign-up", "/forgot-password"] as const;
