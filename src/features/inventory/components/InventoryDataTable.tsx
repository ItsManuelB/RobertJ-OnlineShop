"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RowMenu } from "@/components/ui/row-menu";
import { ErrorState } from "@/components/feedback/ErrorState";
import {
  bulkAdjustStockAction,
  bulkUpdateInventoryThresholdAction,
} from "@/features/inventory/actions/inventory.actions";
import {
  MANUAL_STOCK_ADJUSTMENT_REASONS,
  STOCK_ADJUSTMENT_REASON_LABELS,
} from "@/features/inventory/constants/inventory.constants";
import { MoveStockToOptionsForm } from "@/features/inventory/components/MoveStockToOptionsForm";
import { StockAdjustmentForm } from "@/features/inventory/components/StockAdjustmentForm";
import { StockLevelBar } from "@/features/inventory/components/StockLevelBar";
import { StockHistoryPanel } from "@/features/inventory/components/StockHistoryPanel";
import { InventoryThresholdForm } from "@/features/inventory/components/InventoryThresholdForm";
import { StockStatusBadge } from "@/features/inventory/components/StockStatusBadge";
import type { InventoryItem } from "@/features/inventory/types/inventory.types";
import { ROUTES } from "@/constants/routes";
import { compareNatural } from "@/lib/utils/sort";
import { cn } from "@/lib/utils/cn";

export interface InventoryDataTableProps {
  items: InventoryItem[];
  /** Shown only for an admin, to distinguish shops in a cross-shop list. */
  isAdmin: boolean;
  /** Groups the current paginated rows only; seller inventory stays flat. */
  groupByShop?: boolean;
}

interface InventoryShopGroup {
  key: string;
  name: string;
  items: InventoryItem[];
}

function inventoryShopKey(item: InventoryItem): string {
  return item.shopId ?? `unassigned:${item.shopName ?? "shop"}`;
}

function groupInventoryItems(items: InventoryItem[]): InventoryShopGroup[] {
  const groups = new Map<string, InventoryShopGroup>();
  for (const item of items) {
    const key = inventoryShopKey(item);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        name: item.shopName?.trim() || "Unassigned shop",
        items: [item],
      });
    }
  }
  return [...groups.values()].sort((a, b) => compareNatural(a.name, b.name));
}

const selectClasses =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * Inventory dashboard table — desktop `<table>` + `sm:hidden` card
 * fallback, checkbox multi-select driving bulk stock/threshold controls, and
 * a row menu (kebab) for Adjust stock/History. Single-row adjust/history
 * keep the existing inline-expand interaction (`StockAdjustmentForm`/
 * `StockHistoryPanel`, unchanged) — they just live inside a table row now
 * instead of a standalone card.
 */
export function InventoryDataTable({ items, isAdmin, groupByShop = false }: InventoryDataTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<{ id: string; mode: "adjust" | "history" | "move" | "threshold" } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState(MANUAL_STOCK_ADJUSTMENT_REASONS[0]);
  const [note, setNote] = useState("");
  const [bulkThreshold, setBulkThreshold] = useState("");
  const [useAdminDefault, setUseAdminDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdNotice, setThresholdNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = items.some((i) => selected.has(i.id));
  const selectedItems = items.filter((item) => selected.has(item.id));
  const selectedCount = selectedItems.length;
  const shopGroups = groupByShop ? groupInventoryItems(items) : [];
  const shopGroupByKey = new Map(shopGroups.map((group) => [group.key, group]));
  const displayItems = groupByShop ? shopGroups.flatMap((group) => group.items) : items;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleExpand(id: string, mode: "adjust" | "history" | "move" | "threshold") {
    setExpanded((prev) => (prev?.id === id && prev.mode === mode ? null : { id, mode }));
  }

  function applyBulkAdjust() {
    setError(null);
    setNotice(null);
    const parsedDelta = Number.parseInt(delta, 10);
    if (Number.isNaN(parsedDelta) || parsedDelta === 0) {
      setError("Enter a non-zero adjustment.");
      return;
    }
    if (reason === "other" && !note.trim()) {
      setError("Add a note explaining this adjustment.");
      return;
    }
    startTransition(async () => {
      const result = await bulkAdjustStockAction(
        selectedItems.map((i) => ({ productId: i.productId, variantId: i.variantId })),
        parsedDelta,
        reason,
        note || undefined,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      const { updated, failed } = result.data;
      setNotice(
        `Adjusted ${updated} row${updated === 1 ? "" : "s"}` +
          (failed.length ? `; ${failed.length} failed (${failed[0].error}).` : "."),
      );
      setSelected(new Set());
      setDelta("");
      setNote("");
    });
  }

  function applyBulkThreshold() {
    setThresholdError(null);
    setThresholdNotice(null);

    let threshold: number | null = null;
    if (!useAdminDefault) {
      threshold = Number(bulkThreshold);
      if (bulkThreshold.trim() === "" || !Number.isInteger(threshold) || threshold < 0 || threshold > 10000) {
        setThresholdError("Enter a whole number from 0 to 10000, or choose the admin default.");
        return;
      }
    }

    startTransition(async () => {
      const result = await bulkUpdateInventoryThresholdAction(
        selectedItems.map((item) => ({ productId: item.productId, variantId: item.variantId })),
        threshold,
      );
      if (!result.success) {
        setThresholdError(result.error);
        return;
      }

      const { updated, failed } = result.data;
      setThresholdNotice(
        `${useAdminDefault ? "Reset" : "Set"} threshold for ${updated} row${updated === 1 ? "" : "s"}` +
          (failed.length ? `; ${failed.length} failed (${failed[0].error}).` : "."),
      );
      setSelected(new Set());
      setBulkThreshold("");
      setUseAdminDefault(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedCount > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <span className="text-sm font-semibold text-foreground">{selectedCount} selected</span>
            <div className="flex flex-col gap-1">
              <label htmlFor="bulk-delta" className="text-xs font-medium text-muted-foreground">
                Adjustment
              </label>
              <input
                id="bulk-delta"
                type="number"
                step="1"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                placeholder="e.g. 10 or -2"
                className={`${selectClasses} w-32`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bulk-reason" className="text-xs font-medium text-muted-foreground">
                Reason
              </label>
              <select
                id="bulk-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
                className={selectClasses}
              >
                {MANUAL_STOCK_ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {STOCK_ADJUSTMENT_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bulk-note" className="text-xs font-medium text-muted-foreground">
                Note {reason === "other" ? null : <span className="font-normal">(optional)</span>}
              </label>
              <input
                id="bulk-note"
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. Damaged in storage"
                className={`${selectClasses} w-48`}
              />
            </div>
            <Button type="button" variant="primary" size="rjSm" isLoading={isPending} onClick={applyBulkAdjust}>
              Apply stock adjustment
            </Button>
            <Button type="button" variant="ghost" size="rjSm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="bulk-threshold" className="text-xs font-medium text-muted-foreground">
                Threshold for selected rows
              </label>
              <input
                id="bulk-threshold"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={1}
                value={bulkThreshold}
                onChange={(event) => setBulkThreshold(event.target.value)}
                disabled={useAdminDefault}
                placeholder="e.g. 8"
                className={`${selectClasses} w-32 disabled:opacity-50`}
              />
            </div>
            <label htmlFor="bulk-threshold-default" className="flex min-h-9 items-center gap-2 text-sm text-foreground">
              <Checkbox
                id="bulk-threshold-default"
                checked={useAdminDefault}
                onChange={(event) => setUseAdminDefault(event.target.checked)}
              />
              Use admin default for selected rows
            </label>
            <Button type="button" variant="outline" size="rjSm" isLoading={isPending} onClick={applyBulkThreshold}>
              Apply threshold to selected
            </Button>
          </div>
          {thresholdError ? <ErrorState title="Couldn't apply thresholds" message={thresholdError} /> : null}
          {thresholdNotice ? <p role="status" className="text-sm text-success">{thresholdNotice}</p> : null}
        </div>
      ) : null}

      {error ? <ErrorState title="Something went wrong" message={error} /> : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      {/* ---------------- Desktop table ---------------- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="w-10 p-3">
                <Checkbox
                  checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all inventory rows on this page"
                />
              </th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
              {groupByShop ? null : (
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Shop
                </th>
              )}
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Threshold</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th className="w-10 p-3" />
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, index) => {
              const groupKey = inventoryShopKey(item);
              const group = shopGroupByKey.get(groupKey);
              const startsGroup =
                groupByShop && (index === 0 || inventoryShopKey(displayItems[index - 1]) !== groupKey);

              return (
                <Fragment key={item.id}>
                  {startsGroup && group ? (
                    <tr className="border-b border-border bg-muted/60">
                      <th
                        colSpan={6}
                        scope="row"
                        className="px-3 py-2 text-left text-xs font-semibold text-foreground"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span>{group.name}</span>
                          <span className="font-normal text-muted-foreground">
                            · {group.items.length} row{group.items.length === 1 ? "" : "s"} on this page
                          </span>
                          {group.items[0]?.shopId ? (
                            <Link
                              href={ROUTES.adminShopDashboard(group.items[0].shopId)}
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-[11px]")}
                            >
                              View Dashboard
                            </Link>
                          ) : null}
                        </div>
                      </th>
                    </tr>
                  ) : null}
                  <tr className="border-b border-border last:border-0">
                    <td className="p-3 align-top">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onChange={(event) => toggleOne(item.id, event.target.checked)}
                        aria-label={`Select ${item.productTitle}`}
                      />
                    </td>
                    <td className="p-3 align-top">
                      <p className="text-sm font-semibold text-foreground">
                        {item.productTitle}
                        {item.variantLabel ? (
                          <span className="font-normal text-muted-foreground"> — {item.variantLabel}</span>
                        ) : null}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {item.variantId ? <Badge tone="info">Variant</Badge> : null}
                        {item.isUnassigned ? <Badge tone="warning">Unassigned stock</Badge> : null}
                        {isAdmin && !groupByShop && item.shopName ? (
                          <Badge tone="neutral">{item.shopName}</Badge>
                        ) : null}
                      </div>
                    </td>
                    {groupByShop ? null : (
                      <td className="p-3 align-top text-sm text-muted-foreground">
                        <div className="flex flex-col items-start gap-2">
                          <span>{item.shopName ?? "Unassigned shop"}</span>
                          {isAdmin && item.shopId ? (
                            <Link
                              href={ROUTES.adminShopDashboard(item.shopId)}
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-[11px]")}
                            >
                              View Dashboard
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    )}
                    <td className="p-3 align-top text-sm font-medium text-foreground">
                      {item.quantity}
                      {!item.isUnassigned ? (
                        <StockLevelBar quantity={item.quantity} threshold={item.lowStockThreshold} status={item.stockStatus} />
                      ) : null}
                    </td>
                    <td className="p-3 align-top text-sm text-muted-foreground">
                      {item.lowStockThreshold}
                      {!isAdmin ? (
                        <span className="ml-1.5 text-xs">{item.lowStockThresholdOverride === null ? "(default)" : "(custom)"}</span>
                      ) : null}
                    </td>
                    <td className="p-3 align-top">
                      {item.isUnassigned ? (
                        <span className="text-xs text-muted-foreground">Not sold</span>
                      ) : (
                        <StockStatusBadge status={item.stockStatus} />
                      )}
                    </td>
                    <td className="p-3 align-top text-right">
                      <RowMenu
                        open={openMenuId === item.id}
                        onOpenChange={(open) => setOpenMenuId(open ? item.id : null)}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            toggleExpand(item.id, "adjust");
                            setOpenMenuId(null);
                          }}
                          className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                          Adjust stock
                        </button>
                        {!isAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              toggleExpand(item.id, "threshold");
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            Edit low-stock threshold
                          </button>
                        ) : null}
                        {item.isUnassigned && item.quantity > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              toggleExpand(item.id, "move");
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            Move to options
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            toggleExpand(item.id, "history");
                            setOpenMenuId(null);
                          }}
                          className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                          History
                        </button>
                      </RowMenu>
                    </td>
                  </tr>
                  {expanded?.id === item.id ? (
                    <tr>
                      <td colSpan={groupByShop ? 6 : 7} className="border-b border-border bg-muted p-4">
                        {expanded.mode === "adjust" ? (
                          <StockAdjustmentForm item={item} onDone={() => setExpanded(null)} />
                        ) : expanded.mode === "threshold" ? (
                          <InventoryThresholdForm item={item} onDone={() => setExpanded(null)} />
                        ) : expanded.mode === "move" ? (
                          <MoveStockToOptionsForm item={item} onDone={() => setExpanded(null)} />
                        ) : (
                          <StockHistoryPanel productId={item.productId} variantId={item.variantId} />
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------- Mobile cards ---------------- */}
      <div className="flex flex-col gap-3 sm:hidden">
        {groupByShop
          ? shopGroups.map((group) => (
              <section key={group.key} className="flex flex-col gap-3" aria-label={`Inventory for ${group.name}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold text-foreground">
                    {group.name}
                    <span className="ml-2 font-normal text-muted-foreground">
                      · {group.items.length} row{group.items.length === 1 ? "" : "s"} on this page
                    </span>
                  </h2>
                  {group.items[0]?.shopId ? (
                    <Link
                      href={ROUTES.adminShopDashboard(group.items[0].shopId)}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-[11px]")}
                    >
                      View Dashboard
                    </Link>
                  ) : null}
                </div>
                {group.items.map((item) => renderMobileCard(item))}
              </section>
            ))
          : items.map((item) => renderMobileCard(item))}
      </div>
    </div>
  );

  function renderMobileCard(item: InventoryItem) {
    return (
      <Card key={item.id}>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={selected.has(item.id)}
              onChange={(event) => toggleOne(item.id, event.target.checked)}
              aria-label={`Select ${item.productTitle}`}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {item.productTitle}
                {item.variantLabel ? (
                  <span className="font-normal text-muted-foreground"> — {item.variantLabel}</span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.isUnassigned
                  ? `${item.quantity} unassigned · not sold until moved into an option`
                  : `${item.quantity} in stock · threshold ${item.lowStockThreshold}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.isUnassigned ? (
                  <Badge tone="warning">Unassigned stock</Badge>
                ) : (
                  <StockStatusBadge status={item.stockStatus} />
                )}
                {item.variantId ? <Badge tone="info">Variant</Badge> : null}
                {isAdmin && !groupByShop && item.shopName ? (
                  <>
                    <Badge tone="neutral">{item.shopName}</Badge>
                    {item.shopId ? (
                      <Link
                        href={ROUTES.adminShopDashboard(item.shopId)}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-[11px]")}
                      >
                        View Dashboard
                      </Link>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="rjSm"
              onClick={() => toggleExpand(item.id, "adjust")}
            >
              {expanded?.id === item.id && expanded.mode === "adjust" ? "Hide" : "Adjust stock"}
            </Button>
            {!isAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="rjSm"
                onClick={() => toggleExpand(item.id, "threshold")}
              >
                {expanded?.id === item.id && expanded.mode === "threshold" ? "Hide threshold" : "Edit threshold"}
              </Button>
            ) : null}
            {item.isUnassigned && item.quantity > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="rjSm"
                onClick={() => toggleExpand(item.id, "move")}
              >
                {expanded?.id === item.id && expanded.mode === "move" ? "Hide" : "Move to options"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="rjSm"
              onClick={() => toggleExpand(item.id, "history")}
            >
              {expanded?.id === item.id && expanded.mode === "history" ? "Hide" : "History"}
            </Button>
          </div>
          {expanded?.id === item.id ? (
            <div className="rounded-xl border border-border bg-muted p-4">
              {expanded.mode === "adjust" ? (
                <StockAdjustmentForm item={item} onDone={() => setExpanded(null)} />
              ) : expanded.mode === "threshold" ? (
                <InventoryThresholdForm item={item} onDone={() => setExpanded(null)} />
              ) : expanded.mode === "move" ? (
                <MoveStockToOptionsForm item={item} onDone={() => setExpanded(null)} />
              ) : (
                <StockHistoryPanel productId={item.productId} variantId={item.variantId} />
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }
}
