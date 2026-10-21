"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { resolveSellerOrderByNumberAction } from "@/features/orders/actions/order.actions";
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
  const router = useRouter();

  async function handleDecode(decoded: string): Promise<BarcodeDecodeResult> {
    const result = await resolveSellerOrderByNumberAction(decoded);
    if (!result.success) return { success: false, error: result.error };

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
    </>
  );
}
