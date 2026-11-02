import { USER_ROLES, type UserRole } from "@/constants/roles";

/** Pure, framework-free permission checks shared by server and client code. */
export function canManageProducts(role: UserRole) {
  return role === USER_ROLES.seller || role === USER_ROLES.admin;
}

export function canViewDashboard(role: UserRole) {
  return canManageProducts(role);
}

/**
 * Only buyers may purchase (add to cart, wishlist, checkout, create orders).
 * Seller/admin can browse the read-only storefront but never transact — the
 * authoritative enforcement is server actions + `create_order`/RLS; this
 * helper drives the matching UI hiding and transaction-route guards. Guests
 * are handled by the caller (a null session is treated as "can shop").
 */
export function canPurchase(role: UserRole) {
  return role === USER_ROLES.buyer;
}
