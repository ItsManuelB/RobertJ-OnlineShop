"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RJ_CARD, THEMED_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { BarcodeDecodeResult } from "@/features/orders/components/BarcodeScannerModal";
import type { OrderItem } from "@/features/orders/types/order.types";

// Client-only + code-split: only fetched once the seller has checked every
// item and taps through to scan (mirrors ScanBarcodeButton's lazy import).
const BarcodeScannerModal = dynamic(
  () =>
    import("@/features/orders/components/BarcodeScannerModal").then(
      (mod) => mod.BarcodeScannerModal,
    ),
  { ssr: false },
);

export interface ItemVerificationChecklistProps {
  items: OrderItem[];
  /** This order's own `order_number` — the scan must match it (defense
   * against confirming this order with a different order's label). */
  orderNumber: string;
  isPending: boolean;
  themed?: boolean;
  /**
   * Called once every line has been checked and the seller scans this
   * order's label (or confirms without scanning, camera unavailable).
   * Resolves to whether the status actually advanced server-side — the
   * scanner is only closed as a success once this really settles, never
   * merely once the call was started.
   */
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
}

/**
 * The To Pack → Ready for Pickup gate: the seller ticks off every line
 * (product + variant + quantity) — purely a client-side gate, which lines
 * were ticked is never stored — then scans the order's own shipping-label
 * barcode (attached to the sealed box) to confirm. The checklist is what
 * catches a wrong item/quantity; the scan only proves this specific order's
 * label was read, so it replaces the old plain "confirm" button rather than
 * the checklist itself. Only a `packed_at` audit timestamp is recorded
 * server-side once the transition succeeds. No warehouse-management, no
 * per-item records.
 */
export function ItemVerificationChecklist({
  items,
  orderNumber,
  isPending,
  themed = false,
  onConfirm,
  onCancel,
}: ItemVerificationChecklistProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(false);
  const allChecked = items.length > 0 && items.every((item) => checked[item.id]);
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";

  async function handleDecode(decoded: string): Promise<BarcodeDecodeResult> {
    if (decoded !== orderNumber) {
      return {
        success: false,
        error: "That's a different order's label — scan this order's label instead.",
      };
    }
    const advanced = await onConfirm();
    if (!advanced) {
      return {
        success: false,
        error: "Couldn't mark this order ready for pickup. Please try again.",
      };
    }
    return { success: true };
  }

  return (
    <section
      aria-label="Verify items before packing"
      className={cn(themed ? THEMED_CARD : RJ_CARD, "flex flex-col gap-4 p-5")}
    >
      <div>
        <h3 className={cn("text-sm font-bold", ink)}>Verify items before packing</h3>
        <p className={cn("mt-1 text-xs", muted)}>
          Confirm every item is packed, then scan this order&apos;s shipping label to mark it ready
          for pickup.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3",
                themed ? "border-border" : "border-rj-gray-200",
              )}
            >
              <Checkbox
                checked={checked[item.id] ?? false}
                onChange={(event) =>
                  setChecked((prev) => ({ ...prev, [item.id]: event.target.checked }))
                }
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-semibold", ink)}>
                  {item.productTitle}
                </span>
                <span className={cn("block text-xs", muted)}>
                  {item.variantLabel ? `${item.variantLabel} · ` : ""}
                  Qty {item.quantity}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="rjSm"
          isLoading={isPending}
          disabled={!allChecked}
          onClick={() => setScanning(true)}
        >
          Scan label to confirm
        </Button>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>

      {scanning ? (
        <BarcodeScannerModal
          onClose={() => setScanning(false)}
          onDecode={handleDecode}
          // Camera confirmed unavailable (denied/no device/unsupported): let
          // the seller confirm packing without a scan rather than being
          // permanently blocked. Camera-available scanning is unaffected —
          // this is only reached once the camera has already failed to start.
          onNoCameraFallback={() => {
            setScanning(false);
            void onConfirm();
          }}
          noCameraFallbackLabel="Confirm without scanning"
          title="Scan this order's shipping label"
          resolvingLabel="Confirming…"
          fallbackLabel="Cancel"
        />
      ) : null}
    </section>
  );
}
