"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FILTER_CHIP_ACTIVE_THEMED as CHIP_ACTIVE,
  FILTER_CHIP_IDLE_THEMED as CHIP_IDLE,
} from "@/components/ui/filter-chip";
import { ROLE_LABELS } from "@/constants/roles";
import { FILTERABLE_USER_ROLES } from "@/features/users/constants/user.constants";

export interface UserRoleFilterProps {
  /** Totals shown beside each chip; omitted gives plain chips. */
  counts?: { total: number; buyer: number; seller: number; admin: number };
}

/** All/Buyers/Sellers/Administrators chips for the admin Users list — mirrors `OrderStatusFilter`'s shape. Changing the role keeps the search and clears the page. */
export function UserRoleFilter({ counts }: UserRoleFilterProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeRole = searchParams.get("role") ?? "";

  function updateParams(role: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (role) {
      params.set("role", role);
    } else {
      params.delete("role");
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter users by role">
      <button
        type="button"
        aria-pressed={!activeRole}
        className={!activeRole ? CHIP_ACTIVE : CHIP_IDLE}
        onClick={() => updateParams(null)}
      >
        All
        {counts ? <span className="ml-1.5 tabular-nums opacity-80">{counts.total}</span> : null}
      </button>
      {FILTERABLE_USER_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          aria-pressed={activeRole === role}
          className={activeRole === role ? CHIP_ACTIVE : CHIP_IDLE}
          onClick={() => updateParams(role)}
        >
          {ROLE_LABELS[role]}s
          {counts ? <span className="ml-1.5 tabular-nums opacity-80">{counts[role]}</span> : null}
        </button>
      ))}
    </div>
  );
}
