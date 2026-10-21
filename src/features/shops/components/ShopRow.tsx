"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { deleteShopAction, toggleShopActiveAction } from "@/features/shops/actions/shop.actions";
import { ShopForm } from "@/features/shops/components/ShopForm";
import type { ShopWithMember } from "@/features/shops/types/shop.types";
import { cn } from "@/lib/utils/cn";

export interface ShopRowProps {
  shop: ShopWithMember;
}

/** One shop in the admin management list. Edit swaps the row for an inline `ShopForm`, mirrors `DashboardProductRow`. */
export function ShopRow({ shop }: ShopRowProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);

  if (mode === "edit") {
    return (
      <Card>
        <CardContent className="p-5">
          <ShopForm shop={shop} onDone={() => setMode("view")} />
          <Button
            type="button"
            variant="outline"
            size="rjSm"
            className="mt-3"
            onClick={() => setMode("view")}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await toggleShopActiveAction(shop.id, !shop.active);
      if (!result.success) setError(result.error);
    });
  }

  function handleConfirmDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteShopAction(shop.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      setConfirmingDelete(false);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{shop.name}</p>
              <Badge tone={shop.active ? "success" : "neutral"}>
                {shop.active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {shop.members.length > 0
                ? shop.members.map((member) => member.name).join(", ")
                : "Unassigned"}{" "}
              · /{shop.slug}
            </p>
            {error ? (
              <div className="mt-2">
                <ErrorState title="Something went wrong" message={error} />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={ROUTES.adminShopDashboard(shop.id)}
              className={cn(buttonVariants({ variant: "primary", size: "rjSm" }))}
            >
              View Dashboard
            </Link>
            <Button type="button" variant="outline" size="rjSm" onClick={() => setMode("edit")}>
              Edit
            </Button>
            <Button
              type="button"
              variant={shop.active ? "danger" : "rj"}
              size="rjSm"
              isLoading={isPending}
              onClick={handleToggleActive}
            >
              {shop.active ? "Deactivate" : "Activate"}
            </Button>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                ref={deleteTriggerRef}
                className={cn(buttonVariants({ variant: "danger", size: "rjSm" }))}
                disabled={shop.active}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
              {shop.active ? (
                <p className="text-[10px] text-muted-foreground">Deactivate to enable deletion</p>
              ) : null}
            </div>
          </div>
        </div>

        {deleteError ? (
          <ErrorState title="Couldn't delete this shop" message={deleteError} />
        ) : null}

        {confirmingDelete ? (
          <ConfirmPanel
            label={`Permanently delete ${shop.name}`}
            title={`Permanently delete ${shop.name}?`}
            description="This cannot be undone. Its products, inventory, and other records are kept — only detached from this shop, never deleted. Blocked automatically if it still has an assigned seller or any historical order."
            tone="danger"
            confirmLabel="Delete permanently"
            pendingLabel="Deleting…"
            isPending={isDeletePending}
            triggerRef={deleteTriggerRef}
            onConfirm={handleConfirmDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
