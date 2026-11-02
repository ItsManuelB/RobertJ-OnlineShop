"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmPanel } from "@/components/ui/confirm-panel";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/constants/roles";
import { ROUTES } from "@/constants/routes";
import {
  assignSellerShopAction,
  demoteSellerToBuyerAction,
  setUserActiveAction,
} from "@/features/users/actions/user.actions";
import type { AdminUser } from "@/features/users/types/user.types";
import type { Shop } from "@/features/shops/types/shop.types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";

const ROLE_TONE: Record<UserRole, "neutral" | "info" | "success"> = {
  buyer: "neutral",
  seller: "info",
  admin: "success",
};

export interface UserRowProps {
  user: AdminUser;
  /** Active shops for the assign dropdown — only admins fetch this, matching the Products/Inventory admin shop-picker precedent. */
  shops: Shop[];
  /** True if this buyer has an order in a non-terminal state (M2) — shown as a non-blocking warning before promotion, never used to disable the action. */
  hasActiveOrders?: boolean;
}

/**
 * One user in the admin management list. Buyer/seller rows get an "Assign
 * shop" control — pick a shop, then an explicit confirm step (the shop
 * dropdown alone doesn't submit anything) — that promotes-and-assigns or
 * reassigns via one atomic action, mirroring `CancelOrderButton`'s
 * confirm-panel shape.
 */
export function UserRow({ user, shops, hasActiveOrders = false }: UserRowProps) {
  const [assigning, setAssigning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [confirmingActiveChange, setConfirmingActiveChange] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [isActivePending, startActiveTransition] = useTransition();
  const activeTriggerRef = useRef<HTMLButtonElement>(null);

  const [confirmingDemote, setConfirmingDemote] = useState(false);
  const [demoteError, setDemoteError] = useState<string | null>(null);
  const [isDemotePending, startDemoteTransition] = useTransition();
  const demoteTriggerRef = useRef<HTMLButtonElement>(null);


  // A deactivated admin account is a lockout risk the RPC itself refuses
  // (admin_set_user_active rejects any role='admin' target) — hide the
  // control entirely rather than show one that will always fail.
  const canDeactivate = user.role !== USER_ROLES.admin;
  const canAssignShop = user.role !== USER_ROLES.admin;
  const isPromotingBuyer = user.role === USER_ROLES.buyer;
  // M3: only a seller is a valid demotion target — the RPC itself rejects
  // anything else, this just avoids showing a control that would always fail.
  const canDemote = user.role === USER_ROLES.seller;
  const actionLabel = isPromotingBuyer ? "Promote to Seller" : "Reassign shop";
  // M2: advisory only — the RPC still allows the promotion either way.
  const showActiveOrdersWarning = isPromotingBuyer && hasActiveOrders;
  const selectedShop = shops.find((shop) => shop.id === selectedShopId);

  function handleConfirm() {
    if (!selectedShopId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignSellerShopAction(user.id, selectedShopId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      setAssigning(false);
      setSelectedShopId("");
    });
  }

  function handleConfirmDemote() {
    setDemoteError(null);
    startDemoteTransition(async () => {
      const result = await demoteSellerToBuyerAction(user.id);
      if (!result.success) {
        setDemoteError(result.error);
        return;
      }
      setConfirmingDemote(false);
    });
  }

  function handleConfirmActiveChange() {
    setActiveError(null);
    startActiveTransition(async () => {
      const result = await setUserActiveAction(user.id, !user.isActive);
      if (!result.success) {
        setActiveError(result.error);
        return;
      }
      setConfirmingActiveChange(false);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={user.avatarUrl}
              name={user.fullName ?? user.email ?? "?"}
              size={40}
              className="h-10 w-10 bg-muted text-xs text-foreground"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={ROUTES.adminUserDetail(user.id)}
                  className="truncate rounded-sm text-sm font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {user.fullName ?? user.username ?? "Unnamed user"}
                </Link>
                <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                {user.isActive ? null : <Badge tone="danger">Inactive</Badge>}
                {user.role === USER_ROLES.seller && !user.shopId ? <Badge tone="warning">No shop</Badge> : null}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {user.email ?? "No email"} · {user.shopName ?? "Unassigned"} · Joined{" "}
                {formatDate(user.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canAssignShop ? (
              assigning ? (
                <Button type="button" variant="outline" size="rjSm" onClick={() => setAssigning(false)}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="primary" size="rjSm" onClick={() => setAssigning(true)}>
                  {actionLabel}
                </Button>
              )
            ) : null}

            {canDemote && !confirmingDemote ? (
              <button
                type="button"
                ref={demoteTriggerRef}
                className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
                onClick={() => setConfirmingDemote(true)}
              >
                Demote to Buyer
              </button>
            ) : null}

            {canDeactivate && !confirmingActiveChange ? (
              <button
                type="button"
                ref={activeTriggerRef}
                className={cn(
                  buttonVariants({ variant: user.isActive ? "danger" : "outline", size: "rjSm" }),
                )}
                onClick={() => setConfirmingActiveChange(true)}
              >
                {user.isActive ? "Deactivate" : "Reactivate"}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <ErrorState title="Couldn't assign the shop" message={error} /> : null}

        {assigning && showActiveOrdersWarning ? (
          <div
            role="status"
            className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-xs text-warning"
          >
            <p className="font-semibold">This buyer has an order in progress.</p>
            <p className="mt-0.5 text-warning/90">
              Promoting them won&apos;t cancel or transfer it — it stays in their buyer order
              history as-is. You can still proceed.
            </p>
          </div>
        ) : null}

        {assigning ? (
          <div className="rounded-2xl border border-border bg-muted p-4">
            <label htmlFor={`shop-select-${user.id}`} className="text-sm font-medium">
              Shop
            </label>
            <select
              id={`shop-select-${user.id}`}
              value={selectedShopId}
              onChange={(event) => {
                setSelectedShopId(event.target.value);
                setConfirming(false);
              }}
              className="mt-1.5 h-10 w-full max-w-xs rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">Select a shop…</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>

            {selectedShopId && !confirming ? (
              <Button
                type="button"
                variant="primary"
                size="rjSm"
                className="mt-3"
                onClick={() => setConfirming(true)}
              >
                {actionLabel}
              </Button>
            ) : null}

            {confirming ? (
              <div className="mt-3">
                <ConfirmPanel
                  label={
                    user.role === USER_ROLES.buyer
                      ? `Promote ${user.fullName ?? user.email} to Seller`
                      : `Move ${user.fullName ?? user.email} to ${selectedShop?.name}`
                  }
                  title={
                    user.role === USER_ROLES.buyer
                      ? `Promote ${user.fullName ?? user.email} to Seller and assign them to ${selectedShop?.name}?`
                      : `Move ${user.fullName ?? user.email} to ${selectedShop?.name}?`
                  }
                  description={
                    user.role === USER_ROLES.buyer
                      ? showActiveOrdersWarning
                        ? "They'll gain seller dashboard access, scoped to this shop only. They still have an order in progress — it's unaffected and stays in their buyer order history."
                        : "They'll gain seller dashboard access, scoped to this shop only."
                      : "Their previous shop membership will be removed."
                  }
                  tone="neutral"
                  confirmLabel="Confirm"
                  pendingLabel="Saving…"
                  cancelLabel="Back"
                  isPending={isPending}
                  onConfirm={handleConfirm}
                  onCancel={() => setConfirming(false)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {demoteError ? (
          <ErrorState title="Couldn't demote this seller" message={demoteError} />
        ) : null}

        {confirmingDemote ? (
          <ConfirmPanel
            label={`Demote ${user.fullName ?? user.email} to Buyer`}
            title={`Demote ${user.fullName ?? user.email} to Buyer?`}
            description="They'll immediately lose seller portal access and their shop assignment will be removed. Their existing products, shop, and order history are kept — nothing is deleted. This can be reversed later by promoting them back to Seller."
            tone="danger"
            confirmLabel="Demote to Buyer"
            pendingLabel="Saving…"
            isPending={isDemotePending}
            triggerRef={demoteTriggerRef}
            onConfirm={handleConfirmDemote}
            onCancel={() => setConfirmingDemote(false)}
          />
        ) : null}

        {activeError ? (
          <ErrorState title="Couldn't update this account's status" message={activeError} />
        ) : null}

        {confirmingActiveChange ? (
          <ConfirmPanel
            label={
              user.isActive
                ? `Deactivate ${user.fullName ?? user.email}`
                : `Reactivate ${user.fullName ?? user.email}`
            }
            title={
              user.isActive
                ? `Deactivate ${user.fullName ?? user.email}?`
                : `Reactivate ${user.fullName ?? user.email}?`
            }
            description={
              user.isActive
                ? "They'll immediately lose the ability to place orders, manage their shop, or perform any account action — any active session stops working the moment they try to act. Their order history, products, and shop data are kept — nothing is deleted."
                : "They'll be able to perform actions again."
            }
            tone={user.isActive ? "danger" : "neutral"}
            confirmLabel={user.isActive ? "Deactivate" : "Reactivate"}
            pendingLabel="Saving…"
            isPending={isActivePending}
            triggerRef={activeTriggerRef}
            onConfirm={handleConfirmActiveChange}
            onCancel={() => setConfirmingActiveChange(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
