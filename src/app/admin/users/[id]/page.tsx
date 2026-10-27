import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { THEMED_CARD } from "@/components/ui/card";
import { ROLE_LABELS, USER_ROLES } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import { UserRow } from "@/features/users/components/UserRow";
import { cn } from "@/lib/utils/cn";
import {
  getAdminUserById,
  listBuyerIdsWithActiveOrders,
  listShops,
} from "@/lib/supabase/queries";

interface AdminUserDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: AdminUserDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getAdminUserById(id);
  return {
    title: user ? `${user.fullName ?? user.username ?? "User"} — Admin Portal` : "User not found",
  };
}

/**
 * Admin Users drill-in (L1). The account-details card below covers only
 * what the compact `/admin/users` row doesn't already surface (username,
 * user id) — everything else (avatar, name, role, active status, email,
 * shop, joined date) plus every management action (promote/reassign,
 * demote, activate/deactivate) comes from reusing the exact same `UserRow`
 * used on the list, so M1–M4/L2's logic has a single implementation, not a
 * second copy.
 */
export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { id } = await params;
  const user = await getAdminUserById(id);

  if (!user) notFound();

  const [shops, activeOrderBuyerIds] = await Promise.all([
    listShops(),
    user.role === USER_ROLES.buyer
      ? listBuyerIdsWithActiveOrders([user.id])
      : Promise.resolve(new Set<string>()),
  ]);
  const activeShops = shops.filter((shop) => shop.active);

  const shop = user.shopId ? shops.find((entry) => entry.id === user.shopId) : undefined;
  const displayName = user.fullName ?? user.username ?? "User";

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <Link
          href={ROUTES.adminUsers}
          className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← Back to Users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{displayName}</h1>
        <p className="text-sm text-muted-foreground">
          {ROLE_LABELS[user.role]} account{user.shopName ? ` for ${user.shopName}` : ""}.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <UserRow user={user} shops={activeShops} hasActiveOrders={activeOrderBuyerIds.has(user.id)} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Account details" className={cn(THEMED_CARD, "flex flex-col gap-3 p-5")}>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              Account details
            </h2>
            <dl className="grid grid-cols-1 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Username</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {user.username ? `@${user.username}` : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <Badge tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Active" : "Inactive"}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">User ID</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{user.id}</dd>
              </div>
            </dl>
          </section>

          {user.role === USER_ROLES.seller ? (
            <section aria-label="Shop" className={cn(THEMED_CARD, "flex flex-col gap-2 p-5")}>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">Shop</h2>
              {user.shopId ? (
                <>
                  <p className="text-sm font-semibold text-foreground">{user.shopName ?? "Unnamed shop"}</p>
                  {shop ? (
                    <p className="text-xs text-muted-foreground">{shop.active ? "Active" : "Inactive"} · /{shop.slug}</p>
                  ) : null}
                  <Link
                    href={ROUTES.adminShopDashboard(user.shopId)}
                    className={cn(buttonVariants({ variant: "outline", size: "rjSm" }), "w-fit")}
                  >
                    View dashboard
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No shop assigned. This seller cannot sell until an admin assigns one.
                </p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
