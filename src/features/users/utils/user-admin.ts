import type { AdminUser } from "../types/user.types";

// Type-only imports on purpose: unit-tested with plain Node, which can't resolve the `@/` alias.

/** Account states the Users page can narrow to, beyond the role chips. */
export const USER_STATES = ["unassigned", "inactive", "new"] as const;
export type UserState = (typeof USER_STATES)[number];

export function isUserState(value: string | null | undefined): value is UserState {
  return (USER_STATES as readonly string[]).includes(value ?? "");
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** "New this week" window. */
export const NEW_USER_WINDOW_DAYS = 7;

/** A seller with no shop cannot sell until an admin assigns one. */
export function isUnassignedSeller(user: AdminUser): boolean {
  return user.role === "seller" && !user.shopId;
}

export function matchesUserState(user: AdminUser, state: UserState, now: number = Date.now()): boolean {
  switch (state) {
    case "unassigned":
      return isUnassignedSeller(user);
    case "inactive":
      return !user.isActive;
    case "new":
      return now - new Date(user.createdAt).getTime() <= NEW_USER_WINDOW_DAYS * DAY_MS;
  }
}

export interface UserSummary {
  total: number;
  buyer: number;
  seller: number;
  admin: number;
  unassignedSellers: number;
  inactive: number;
  newThisWeek: number;
}

export function summarizeUsers(users: readonly AdminUser[], now: number = Date.now()): UserSummary {
  const summary: UserSummary = {
    total: users.length,
    buyer: 0,
    seller: 0,
    admin: 0,
    unassignedSellers: 0,
    inactive: 0,
    newThisWeek: 0,
  };
  for (const user of users) {
    summary[user.role] += 1;
    if (isUnassignedSeller(user)) summary.unassignedSellers += 1;
    if (!user.isActive) summary.inactive += 1;
    if (matchesUserState(user, "new", now)) summary.newThisWeek += 1;
  }
  return summary;
}
