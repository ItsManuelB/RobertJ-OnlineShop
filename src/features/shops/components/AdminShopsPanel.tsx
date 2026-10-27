"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FILTER_CHIP_ACTIVE_THEMED, FILTER_CHIP_IDLE_THEMED } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ShopForm } from "@/features/shops/components/ShopForm";
import { ShopRow } from "@/features/shops/components/ShopRow";
import type { ShopWithMember } from "@/features/shops/types/shop.types";
import {
  SHOP_STATUS_FILTERS,
  SHOP_STATUS_FILTER_LABELS,
  filterShops,
  summarizeShops,
  type ShopStatusFilter,
} from "@/features/shops/utils/shop-admin";
import { cn } from "@/lib/utils/cn";

export interface AdminShopsPanelProps {
  shops: ShopWithMember[];
}

const SUMMARY_CARD = "flex flex-col gap-0.5 rounded-xl border border-border bg-card p-3";

/** `/admin/shops` list: summary cards, search, active / inactive chips, then one row per shop. Filtering is local because the page already loads every shop. */
export function AdminShopsPanel({ shops }: AdminShopsPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ShopStatusFilter>("all");

  const summary = summarizeShops(shops);
  const visible = filterShops(shops, search, status);
  const counts: Record<ShopStatusFilter, number> = {
    all: summary.total,
    active: summary.active,
    inactive: summary.inactive,
  };

  return (
    <div className="flex flex-col gap-6">
      {shops.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{summary.total}</span>
            <span className="text-sm font-semibold text-foreground">Shops</span>
          </li>
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-primary">{summary.active}</span>
            <span className="text-sm font-semibold text-foreground">Active</span>
          </li>
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-foreground">{summary.inactive}</span>
            <span className="text-sm font-semibold text-foreground">Inactive</span>
          </li>
          <li className={SUMMARY_CARD}>
            <span className="text-2xl font-semibold tabular-nums text-warning">{summary.unassigned.length}</span>
            <span className="text-sm font-semibold text-foreground">With no seller</span>
            {summary.unassigned.length > 0 ? (
              <span className="truncate text-xs text-muted-foreground">{summary.unassigned.join(", ")}</span>
            ) : null}
          </li>
        </ul>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] flex-1">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by shop or seller"
              aria-label="Search shops"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            size="rjSm"
            onClick={() => setShowCreateForm((value) => !value)}
          >
            {showCreateForm ? "Cancel" : "New shop"}
          </Button>
        </div>
        {shops.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter shops by status">
            {SHOP_STATUS_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={cn(status === value ? FILTER_CHIP_ACTIVE_THEMED : FILTER_CHIP_IDLE_THEMED)}
              >
                {SHOP_STATUS_FILTER_LABELS[value]}
                <span className="ml-1.5 tabular-nums opacity-80">{counts[value]}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showCreateForm ? (
        <div className="rounded-2xl border border-border bg-muted p-5">
          <ShopForm onDone={() => setShowCreateForm(false)} />
        </div>
      ) : null}

      {shops.length === 0 ? (
        <EmptyState
          title="No shops yet"
          description="Create the first shop to start onboarding sellers."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matching shops"
          description="Try a different search term or clear a filter."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((shop) => (
            <ShopRow key={shop.id} shop={shop} />
          ))}
        </div>
      )}
    </div>
  );
}
