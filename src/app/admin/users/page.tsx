import { Suspense } from "react";
import type { Metadata } from "next";

import { ErrorState } from "@/components/feedback/ErrorState";
import { USER_ROLES, type UserRole } from "@/constants/roles";
import { DashboardRowsSkeleton } from "@/features/dashboard/components/DashboardRowsSkeleton";
import { PaginationControls } from "@/features/products/components/PaginationControls";
import { isFilterableUserRole } from "@/features/users/constants/user.constants";
import { UserAttentionStrip } from "@/features/users/components/UserAttentionStrip";
import { UserRoleFilter } from "@/features/users/components/UserRoleFilter";
import { UserSearchInput } from "@/features/users/components/UserSearchInput";
import { UsersTable } from "@/features/users/components/UsersTable";
import { userListParamsSchema } from "@/features/users/schemas/user.schema";
import type { AdminUser } from "@/features/users/types/user.types";
import {
  isUserState,
  matchesUserState,
  summarizeUsers,
  type UserState,
} from "@/features/users/utils/user-admin";
import { listBuyerIdsWithActiveOrders, listShops, listAdminUsers } from "@/lib/supabase/queries";
import type { Shop } from "@/features/shops/types/shop.types";

export const metadata: Metadata = { title: "Users — Admin Portal" };

interface AdminUsersDataProps {
  users: AdminUser[];
  shops: Shop[];
  role: UserRole | null;
  state: UserState | null;
  search?: string;
  page: number;
  pageSize: number;
}

/**
 * `admin_list_users()` has no server-side search/limit/offset params (see
 * that RPC's migration — it exists solely to join `auth.users.email`, not to
 * scale to a paginated query shape), so search, the account-group filter and
 * pagination are applied here, in the same in-memory step that already did
 * the `role` filter.
 */
async function AdminUsersData({ users, shops, role, state, search, page, pageSize }: AdminUsersDataProps) {
  const activeShops = shops.filter((shop) => shop.active);

  let filteredUsers = role ? users.filter((user) => user.role === role) : users;
  if (state) filteredUsers = filteredUsers.filter((user) => matchesUserState(user, state));
  if (search) {
    const needle = search.toLowerCase();
    filteredUsers = filteredUsers.filter((user) =>
      [user.fullName, user.username, user.email].some((value) =>
        value?.toLowerCase().includes(needle),
      ),
    );
  }

  const filtering = Boolean(role || state || search);
  const total = filteredUsers.length;

  if (total === 0) {
    return <UsersTable users={[]} shops={activeShops} filtering={filtering} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageUsers = filteredUsers.slice(start, start + pageSize);

  if (pageUsers.length === 0) {
    return <UsersTable users={[]} shops={activeShops} filtering={filtering} />;
  }

  // M2: only the buyers actually rendered need the active-orders check —
  // it's advisory (shown before promoting), never a blocker.
  const buyerIdsOnPage = pageUsers
    .filter((user) => user.role === USER_ROLES.buyer)
    .map((user) => user.id);
  const activeOrderBuyerIds = await listBuyerIdsWithActiveOrders(buyerIdsOnPage);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total} user{total === 1 ? "" : "s"}
        {filtering ? " match" : ""}
      </p>
      <UsersTable
        users={pageUsers}
        shops={activeShops}
        filtering={filtering}
        activeOrderBuyerIds={activeOrderBuyerIds}
      />
      {totalPages > 1 ? <PaginationControls page={page} totalPages={totalPages} themed /> : null}
    </div>
  );
}

interface AdminUsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const roleParam = typeof params.role === "string" ? params.role : null;
  const role: UserRole | null = isFilterableUserRole(roleParam) ? roleParam : null;
  const stateParam = typeof params.state === "string" ? params.state : null;
  const state: UserState | null = isUserState(stateParam) ? stateParam : null;

  const parsed = userListParamsSchema.safeParse(params);
  if (!parsed.success) {
    return (
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        <ErrorState message="Those filters aren't valid. Try clearing your search." />
      </div>
    );
  }
  const { search, page, pageSize } = parsed.data;

  // One read serves the cards, the chip counts and the list. A failure is
  // shown in place of the list rather than failing the page shell.
  let users: AdminUser[];
  let shops: Shop[];
  try {
    [users, shops] = await Promise.all([listAdminUsers(), listShops()]);
  } catch {
    return (
      <div className="flex flex-col gap-6 p-5 lg:p-7">
        <ErrorState message="We couldn't load users right now." />
      </div>
    );
  }
  const summary = summarizeUsers(users);

  return (
    <div className="flex flex-col gap-6 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Manage accounts, roles and shop assignments.</p>
      </div>

      <UserAttentionStrip summary={summary} activeState={state} />

      <div className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <UserRoleFilter counts={summary} />
        </Suspense>
        <Suspense fallback={null}>
          <UserSearchInput />
        </Suspense>
      </div>

      <Suspense
        key={JSON.stringify(params)}
        fallback={<DashboardRowsSkeleton label="Loading users" />}
      >
        <AdminUsersData
          users={users}
          shops={shops}
          role={role}
          state={state}
          search={search}
          page={page}
          pageSize={pageSize}
        />
      </Suspense>
    </div>
  );
}
