"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { RowMenu } from "@/components/ui/row-menu";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import {
  PRODUCT_CONDITION_LABELS,
  PRODUCT_STATUS,
  PRODUCT_STATUS_LABELS,
  type ProductStatus,
} from "@/constants/status";
import {
  archiveProductAction,
  assignProductShopAction,
  bulkArchiveProductsAction,
  bulkAssignProductCategoryAction,
  bulkUpdateProductStatusAction,
  restoreProductAction,
} from "@/features/products/actions/product.actions";
import { ProductGridCard } from "@/features/products/components/ProductGridCard";
import { ProductStatusBadge } from "@/features/products/components/ProductStatusBadge";
import type { Category } from "@/features/categories/types/category.types";
import { getCoverImage, type Product, type ProductVariant } from "@/features/products/types/product.types";
import type { Shop } from "@/features/shops/types/shop.types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

export interface ProductsDataTableProps {
  products: Product[];
  categories: Category[];
  /** Populated only for an admin (from `listShops()`); empty for a seller. */
  shops: Shop[];
  isAdmin: boolean;
  /** Every variant visible to the caller — filtered per row below, no N+1. */
  variants: ProductVariant[];
  /** variantId -> live stock, for the Stock column of products that have options. */
  variantStock: Record<string, number>;
  /** Effective inventory thresholds plus the default for rows without a match. */
  inventoryThresholds: { byItem: Record<string, number>; defaultThreshold: number };
  /** Presentation only — defaults to the pre-existing table/card layout. */
  view?: "grid" | "list";
  /** True when the caller filtered to `status=archived` (the Recycle Bin view) — swaps each row's Archive action for Restore and hides the bulk-archive button. */
  isArchivedView?: boolean;
}

function initials(title: string) {
  const words = title.split(" ").filter(Boolean);
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
}

function stockCell(
  product: Product,
  variants: ProductVariant[],
  variantStock: Record<string, number>,
  inventoryThresholds: { byItem: Record<string, number>; defaultThreshold: number },
) {
  if (variants.length > 0) {
    // With options, the product's own quantity is not used: the total is across its options.
    const stocks = variants.map((variant) => variantStock[variant.id] ?? 0);
    const total = stocks.reduce((sum, quantity) => sum + quantity, 0);
    const soldOut = stocks.filter((quantity) => quantity <= 0).length;
    const lowStock = variants.some((variant) => {
      const quantity = variantStock[variant.id] ?? 0;
      return quantity > 0 && quantity <= (inventoryThresholds.byItem[variant.id] ?? inventoryThresholds.defaultThreshold);
    });
    const tone = total <= 0 ? "danger" : lowStock || soldOut > 0 ? "warning" : "success";
    const label = total <= 0 ? "Out of stock" : lowStock ? "Some options low stock" : soldOut > 0 ? "Some sold out" : "In stock";
    return (
      <div className="flex flex-col gap-1">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-xs text-muted-foreground">
          {total} in stock · {variants.length} option{variants.length === 1 ? "" : "s"}
          {soldOut > 0 && total > 0 ? ` · ${soldOut} sold out` : ""}
        </span>
      </div>
    );
  }
  const threshold = inventoryThresholds.byItem[product.id] ?? inventoryThresholds.defaultThreshold;
  const tone = product.quantity <= 0 ? "danger" : product.quantity <= threshold ? "warning" : "success";
  const label = product.quantity <= 0 ? "Out of stock" : product.quantity <= threshold ? "Low stock" : "In stock";
  return (
    <div className="flex flex-col gap-1">
      <Badge tone={tone}>{label}</Badge>
      <span className="text-xs text-muted-foreground">{product.quantity} in stock</span>
    </div>
  );
}

/**
 * Products dashboard table — desktop `<table>` + `sm:hidden` card fallback,
 * checkbox multi-select driving a bulk-actions bar, and a row menu (kebab)
 * for Edit/Manage stock/Archive. Replaces `DashboardProductRow`'s one-card-
 * per-product stack; single-row edit opens the full-page product editor.
 */
export function ProductsDataTable({
  products,
  categories,
  shops,
  isAdmin,
  variants,
  variantStock,
  inventoryThresholds,
  view = "list",
  isArchivedView = false,
}: ProductsDataTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmArchiveIds, setConfirmArchiveIds] = useState<string[] | null>(null);
  const [assigningShopId, setAssigningShopId] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState("");
  /** Set only when transferring an *already-assigned* product (not the initial assign) — the more consequential case gets an explicit confirm step. */
  const [confirmingTransferId, setConfirmingTransferId] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);

  const router = useRouter();
  /** Editing is a full page (the same editor the Add product page uses), not a drawer. */
  const editHref = (id: string) => (isAdmin ? ROUTES.adminProductEdit(id) : ROUTES.sellerProductEdit(id));
  const inventoryHref = isAdmin ? ROUTES.adminInventory : ROUTES.sellerInventory;

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const someSelected = products.some((p) => selected.has(p.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(products.map((p) => p.id)) : new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function clearFeedback() {
    setError(null);
    setNotice(null);
  }

  function runBulkArchive(ids: string[]) {
    clearFeedback();
    startTransition(async () => {
      const result = await bulkArchiveProductsAction(ids);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice(`${result.data.updated} product${result.data.updated === 1 ? "" : "s"} archived.`);
      setSelected(new Set());
      setConfirmArchiveIds(null);
    });
  }

  function runBulkStatus(status: ProductStatus) {
    clearFeedback();
    setStatusMenuOpen(false);
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await bulkUpdateProductStatusAction(ids, status);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice(`${result.data.updated} product${result.data.updated === 1 ? "" : "s"} set to ${PRODUCT_STATUS_LABELS[status]}.`);
      setSelected(new Set());
    });
  }

  function runBulkCategory(categoryId: string, categoryName: string) {
    clearFeedback();
    setCategoryMenuOpen(false);
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await bulkAssignProductCategoryAction(ids, categoryId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice(`${result.data.updated} product${result.data.updated === 1 ? "" : "s"} moved to ${categoryName}.`);
      setSelected(new Set());
    });
  }

  function runArchiveOne(id: string) {
    clearFeedback();
    startTransition(async () => {
      const result = await archiveProductAction(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmArchiveIds(null);
    });
  }

  /** No confirm panel — restoring is safe/reversible (unlike Archive), so it's a direct one-click action. */
  function runRestoreOne(id: string) {
    clearFeedback();
    startTransition(async () => {
      const result = await restoreProductAction(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice("Product restored.");
    });
  }

  function runAssignShop(productId: string) {
    if (!selectedShopId) return;
    clearFeedback();
    startTransition(async () => {
      const result = await assignProductShopAction(productId, selectedShopId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setAssigningShopId(null);
      setConfirmingTransferId(null);
      setSelectedShopId("");
    });
  }

  function cancelAssignShop() {
    setAssigningShopId(null);
    setConfirmingTransferId(null);
    setSelectedShopId("");
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-4">
      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-semibold text-foreground">
            {selectedCount} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="rjSm"
                onClick={() => {
                  setStatusMenuOpen((v) => !v);
                  setCategoryMenuOpen(false);
                }}
              >
                Change status ▾
              </Button>
              {statusMenuOpen ? (
                <div
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setStatusMenuOpen(false);
                  }}
                  className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-card p-1 shadow-md"
                >
                  {[PRODUCT_STATUS.draft, PRODUCT_STATUS.active, PRODUCT_STATUS.sold].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => runBulkStatus(status)}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                      {PRODUCT_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="rjSm"
                onClick={() => {
                  setCategoryMenuOpen((v) => !v);
                  setStatusMenuOpen(false);
                }}
              >
                Assign category ▾
              </Button>
              {categoryMenuOpen ? (
                <div
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setCategoryMenuOpen(false);
                  }}
                  className="absolute right-0 top-full z-20 mt-1 max-h-64 min-w-[180px] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-md"
                >
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => runBulkCategory(category.id, category.name)}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {isArchivedView ? null : (
              <button
                type="button"
                ref={archiveTriggerRef}
                className={cn(buttonVariants({ variant: "danger", size: "rjSm" }))}
                onClick={() => setConfirmArchiveIds(Array.from(selected))}
              >
                Archive
              </button>
            )}
            <Button type="button" variant="ghost" size="rjSm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorState title="Something went wrong" message={error} /> : null}
      {notice ? <p className="text-sm text-success">{notice}</p> : null}

      {confirmArchiveIds && confirmArchiveIds.length > 1 ? (
        <ConfirmPanel
          label={`Archive ${confirmArchiveIds.length} products`}
          title={`Archive ${confirmArchiveIds.length} products?`}
          tone="danger"
          confirmLabel="Confirm archive"
          isPending={isPending}
          triggerRef={archiveTriggerRef}
          onConfirm={() => runBulkArchive(confirmArchiveIds)}
          onCancel={() => setConfirmArchiveIds(null)}
        />
      ) : null}

      {/* ---------------- Grid view ---------------- */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const productVariants = variants.filter((v) => v.productId === product.id);
            return (
              <ProductGridCard
                key={product.id}
                product={product}
                stock={stockCell(product, productVariants, variantStock, inventoryThresholds)}
                selected={selected.has(product.id)}
                isAdmin={isAdmin}
                inventoryHref={inventoryHref}
                menuOpen={openMenuId === product.id}
                isPending={isPending}
                confirmingArchive={
                  confirmArchiveIds !== null &&
                  confirmArchiveIds.length === 1 &&
                  confirmArchiveIds[0] === product.id
                }
                assigningShop={assigningShopId === product.id}
                shops={shops}
                selectedShopId={selectedShopId}
                isArchivedView={isArchivedView}
                onToggleSelect={(checked) => toggleOne(product.id, checked)}
                onEdit={() => router.push(editHref(product.id))}
                onMenuOpenChange={(open) => setOpenMenuId(open ? product.id : null)}
                onRequestArchive={() => {
                  setConfirmArchiveIds([product.id]);
                  setOpenMenuId(null);
                }}
                onRestore={() => {
                  runRestoreOne(product.id);
                  setOpenMenuId(null);
                }}
                onConfirmArchive={() => runArchiveOne(product.id)}
                onCancelArchive={() => setConfirmArchiveIds(null)}
                onRequestAssignShop={() => {
                  setAssigningShopId(product.id);
                  setOpenMenuId(null);
                }}
                onSelectedShopIdChange={setSelectedShopId}
                onConfirmAssignShop={() => runAssignShop(product.id)}
                onCancelAssignShop={() => setAssigningShopId(null)}
              />
            );
          })}
        </div>
      ) : null}

      {/* ---------------- Desktop table ---------------- */}
      <div className={cn("overflow-x-auto rounded-2xl border border-border bg-card", view === "list" ? "hidden sm:block" : "hidden")}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th scope="col" className="w-10 p-3">
                <Checkbox
                  checked={someSelected && !allSelected ? "indeterminate" : allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  aria-label="Select all products on this page"
                />
              </th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock</th>
              <th scope="col" className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              <th scope="col" className="w-10 p-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const productVariants = variants.filter((v) => v.productId === product.id);
              const cover = getCoverImage(product);
              return (
                <Fragment key={product.id}>
                  <tr className={cn("border-b border-border last:border-0", selected.has(product.id) && "bg-primary/5")}>
                    <td className="p-3 align-top">
                      <Checkbox
                        checked={selected.has(product.id)}
                        onChange={(event) => toggleOne(product.id, event.target.checked)}
                        aria-label={`Select ${product.title}`}
                      />
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-bold text-muted-foreground">
                          {cover ? (
                            <Image src={cover.url} alt={cover.altText ?? ""} fill sizes="40px" className="object-cover" />
                          ) : (
                            initials(product.title)
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={editHref(product.id)}
                            className="block max-w-[220px] truncate text-left text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                          >
                            {product.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {product.categoryName ?? "No category"} · {PRODUCT_CONDITION_LABELS[product.condition]}
                          </p>
                          {product.shopId === null ? <Badge tone="warning">Unassigned</Badge> : null}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 align-top text-sm font-medium text-foreground">
                      {formatCurrency(product.priceCents, product.currency)}
                    </td>
                    <td className="p-3 align-top">{stockCell(product, productVariants, variantStock, inventoryThresholds)}</td>
                    <td className="p-3 align-top"><ProductStatusBadge status={product.status} /></td>
                    <td className="p-3 align-top text-right">
                      <RowMenu
                        open={openMenuId === product.id}
                        onOpenChange={(open) => setOpenMenuId(open ? product.id : null)}
                      >
                        <Link
                          href={editHref(product.id)}
                          onClick={() => setOpenMenuId(null)}
                          className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`${inventoryHref}?search=${encodeURIComponent(product.title)}`}
                          onClick={() => setOpenMenuId(null)}
                          className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                        >
                          Manage stock
                        </Link>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAssigningShopId(product.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            {product.shopId === null ? "Assign to shop" : "Transfer to another shop"}
                          </button>
                        ) : null}
                        <hr className="my-1 border-border" />
                        {isArchivedView ? (
                          <button
                            type="button"
                            onClick={() => {
                              runRestoreOne(product.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmArchiveIds([product.id]);
                              setOpenMenuId(null);
                            }}
                            className="w-full rounded px-2 py-1.5 text-left text-sm text-danger hover:bg-danger/10"
                          >
                            Archive
                          </button>
                        )}
                      </RowMenu>
                    </td>
                  </tr>
                  {confirmArchiveIds && confirmArchiveIds.length === 1 && confirmArchiveIds[0] === product.id ? (
                    <tr>
                      <td colSpan={8} className="border-b border-border bg-muted p-4">
                        <ConfirmPanel
                          label={`Archive ${product.title}`}
                          title={`Archive ${product.title}?`}
                          tone="danger"
                          confirmLabel="Confirm archive"
                          isPending={isPending}
                          onConfirm={() => runArchiveOne(product.id)}
                          onCancel={() => setConfirmArchiveIds(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                  {assigningShopId === product.id ? (
                    <tr>
                      <td colSpan={8} className="border-b border-border bg-muted p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={selectedShopId}
                              onChange={(event) => {
                                setSelectedShopId(event.target.value);
                                setConfirmingTransferId(null);
                              }}
                              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                            >
                              <option value="">Select a shop…</option>
                              {shops.map((shop) => (
                                <option key={shop.id} value={shop.id}>
                                  {shop.name}
                                </option>
                              ))}
                            </select>
                            {selectedShopId && confirmingTransferId !== product.id ? (
                              <Button
                                type="button"
                                variant="primary"
                                size="rjSm"
                                isLoading={isPending}
                                onClick={() => {
                                  if (product.shopId === null) {
                                    runAssignShop(product.id);
                                  } else {
                                    setConfirmingTransferId(product.id);
                                  }
                                }}
                              >
                                {product.shopId === null ? "Assign" : "Transfer"}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              size="rjSm"
                              disabled={isPending}
                              onClick={cancelAssignShop}
                            >
                              Cancel
                            </Button>
                          </div>
                          {confirmingTransferId === product.id ? (
                            <ConfirmPanel
                              label={`Transfer ${product.title} to ${shops.find((shop) => shop.id === selectedShopId)?.name ?? "the selected shop"}`}
                              title={`Transfer ${product.title} to ${shops.find((shop) => shop.id === selectedShopId)?.name ?? "the selected shop"}?`}
                              description="Sellers at the current shop lose access to this product and its stock; sellers at the destination shop gain it immediately. This can be changed again later."
                              tone="neutral"
                              confirmLabel="Confirm transfer"
                              pendingLabel="Transferring…"
                              cancelLabel="Back"
                              isPending={isPending}
                              onConfirm={() => runAssignShop(product.id)}
                              onCancel={() => setConfirmingTransferId(null)}
                            />
                          ) : null}
                        </div>
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
      <div className={cn("flex flex-col gap-3", view === "list" ? "sm:hidden" : "hidden")}>
        {products.map((product) => {
          const productVariants = variants.filter((v) => v.productId === product.id);
          const cover = getCoverImage(product);
          return (
            <Card key={product.id} className={cn(selected.has(product.id) && "ring-2 ring-primary")}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(product.id)}
                    onChange={(event) => toggleOne(product.id, event.target.checked)}
                    aria-label={`Select ${product.title}`}
                    className="mt-1"
                  />
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-bold text-muted-foreground">
                    {cover ? (
                      <Image src={cover.url} alt={cover.altText ?? ""} fill sizes="56px" className="object-cover" />
                    ) : (
                      initials(product.title)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{product.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.categoryName ?? "No category"} · {formatCurrency(product.priceCents, product.currency)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ProductStatusBadge status={product.status} />
                      {stockCell(product, productVariants, variantStock, inventoryThresholds)}
                      {product.shopId === null ? <Badge tone="warning">Unassigned</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={editHref(product.id)} className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}>
                    Edit
                  </Link>
                  <Link
                    href={`${inventoryHref}?search=${encodeURIComponent(product.title)}`}
                    className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
                  >
                    Manage stock
                  </Link>
                  {isArchivedView ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="rjSm"
                      isLoading={isPending}
                      onClick={() => runRestoreOne(product.id)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: "danger", size: "rjSm" }))}
                      onClick={() => setConfirmArchiveIds([product.id])}
                    >
                      Archive
                    </button>
                  )}
                </div>
                {confirmArchiveIds && confirmArchiveIds.length === 1 && confirmArchiveIds[0] === product.id ? (
                  <ConfirmPanel
                    label={`Archive ${product.title}`}
                    title={`Archive ${product.title}?`}
                    tone="danger"
                    confirmLabel="Confirm archive"
                    isPending={isPending}
                    onConfirm={() => runArchiveOne(product.id)}
                    onCancel={() => setConfirmArchiveIds(null)}
                  />
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
