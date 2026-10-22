"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import {
  resolveSellerOrderByNumberAction,
  type ScannedOrderSummary,
} from "@/features/orders/actions/order.actions";
import { ScanPackConfirmDialog } from "@/features/orders/components/ScanPackConfirmDialog";
import type { BarcodeDecodeResult } from "@/features/orders/components/BarcodeScannerModal";

// Client-only + code-split: the scanner modal and its `@zxing/browser` import
// are only fetched when the seller actually opens the scanner.
const BarcodeScannerModal = dynamic(
  () =>
    import("@/features/orders/components/BarcodeScannerModal").then(
      (mod) => mod.BarcodeScannerModal,
    ),
  { ssr: false },
);

/**
 * "Scan barcode" entry point beside the seller order search. Opens the
 * camera scanner, resolves the decoded `order_number` to the seller's own
 * order, and navigates there — Ready for Pickup orders go straight into the
 * ship-confirmation form (`?scan=ship`), every other status just opens the
 * order. Manual search remains available as the fallback.
 */
export function ScanBarcodeButton() {
  const [open, setOpen] = useState(false);
  const [packScan, setPackScan] = useState<{ orderId: string; summary: ScannedOrderSummary } | null>(null);
  const router = useRouter();

  async function handleDecode(decoded: string): Promise<BarcodeDecodeResult> {
    const result = await resolveSellerOrderByNumberAction(decoded);
    if (!result.success) return { success: false, error: result.error };

    // To Pack: pop up the confirmation instead of navigating away.
    if (result.data.summary) {
      setPackScan({ orderId: result.data.orderId, summary: result.data.summary });
      return { success: true };
    }

    const detailUrl =
      result.data.status === "processing"
        ? `${ROUTES.sellerOrderDetail(result.data.orderId)}?scan=ship`
        : ROUTES.sellerOrderDetail(result.data.orderId);
    router.push(detailUrl);
    return { success: true };
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="rjSm"
        onClick={() => setOpen(true)}
        className="shrink-0 text-foreground"
      >
        <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" />
        Scan barcode
      </Button>
      {open ? <BarcodeScannerModal themed onClose={() => setOpen(false)} onDecode={handleDecode} /> : null}
      {packScan ? (
        <ScanPackConfirmDialog
          orderId={packScan.orderId}
          summary={packScan.summary}
          onClose={() => setPackScan(null)}
        />
      ) : null}
    </>
  );
}
