import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import type { UserState } from "@/features/users/utils/user-admin";
import type { UserSummary } from "@/features/users/utils/user-admin";
import { cn } from "@/lib/utils/cn";

export interface UserAttentionStripProps {
  summary: UserSummary;
  /** The `?state=` currently applied, so its card reads as selected. */
  activeState: UserState | null;
}

interface Card {
  key: UserState;
  count: number;
  label: string;
  hint: string;
  href: string;
  danger?: boolean;
}

const CARD =
  "flex h-full flex-col gap-0.5 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * Account groups that need an admin's eye, above the Users list: sellers who
 * cannot sell yet, accounts that cannot sign in, and recent sign-ups. Each is
 * a plain link to the same list narrowed by `?state=`, so there is no client
 * state; selecting the active card again clears the filter.
 */
export function UserAttentionStrip({ summary, activeState }: UserAttentionStripProps) {
  const cards: Card[] = [
    {
      key: "unassigned",
      count: summary.unassignedSellers,
      label: summary.unassignedSellers === 1 ? "Seller with no shop" : "Sellers with no shop",
      hint: "They cannot sell until assigned",
      href: `${ROUTES.adminUsers}?role=seller&state=unassigned`,
      danger: true,
    },
    {
      key: "inactive",
      count: summary.inactive,
      label: summary.inactive === 1 ? "Deactivated account" : "Deactivated accounts",
      hint: "They cannot sign in",
      href: `${ROUTES.adminUsers}?state=inactive`,
    },
    {
      key: "new",
      count: summary.newThisWeek,
      label: "New this week",
      hint: "Registered in the last 7 days",
      href: `${ROUTES.adminUsers}?state=new`,
    },
  ];

  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {cards.map((card) => {
        const selected = activeState === card.key;
        return (
          <li key={card.key} className="min-w-0">
            <Link
              href={selected ? ROUTES.adminUsers : card.href}
              aria-current={selected ? "true" : undefined}
              className={cn(CARD, selected ? "border-primary ring-1 ring-primary/30" : "border-border")}
            >
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  card.danger && card.count > 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {card.count}
              </span>
              <span className="text-sm font-semibold text-foreground">{card.label}</span>
              <span className="text-xs text-muted-foreground">{card.hint}</span>
              <span className="mt-1 text-xs font-semibold text-primary">
                {selected ? "Clear filter ×" : "Review →"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
