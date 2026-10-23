"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import {
  resolveSellerOrderByNumberAction,
  type ScannedOrderResolution,
  type ScannedOrderSummary,
} from "@/features/orders/actions/order.actions";
import { BarcodeUploadDialog } from "@/features/orders/components/BarcodeUploadDialog";
import { useHardwareScanner } from "@/features/orders/hooks/useHardwareScanner";
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
 * Barcode entry points beside the seller order search, all resolving the
 * `order_number` to the seller's own order and doing the same thing with it:
 * the live camera scanner, "Upload barcode" inside it (read a photo or
 * screenshot of the label in the browser, no steady hand needed), and a USB/Bluetooth handheld
 * scanner (which types the number and presses Enter). Ready for Pickup orders
 * go straight into the ship-confirmation form (`?scan=ship`), To Pack orders
 * show a confirm popup, every other status just opens the order. Manual
 * search remains available as the fallback.
 */
export function ScanBarcodeButton() {
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [packScan, setPackScan] = useState<{ orderId: string; summary: ScannedOrderSummary } | null>(null);
  const router = useRouter();

  function openResolved(data: ScannedOrderResolution) {
    // To Pack: pop up the confirmation instead of navigating away.
    if (data.summary) {
      setPackScan({ orderId: data.orderId, summary: data.summary });
      return;
    }
    router.push(
      data.status === "processing"
        ? `${ROUTES.sellerOrderDetail(data.orderId)}?scan=ship`
        : ROUTES.sellerOrderDetail(data.orderId),
    );
  }

  async function handleDecode(decoded: string): Promise<BarcodeDecodeResult> {
    const result = await resolveSellerOrderByNumberAction(decoded);
    if (!result.success) return { success: false, error: result.error };
    openResolved(result.data);
    return { success: true };
  }

  // Handheld scanner: runs only while no scanner dialog is open, so a scan can't act behind one.
  useHardwareScanner({
    enabled: !open && !uploadOpen && !packScan,
    onScan: (orderNumber) => {
      setNotice("Looking up the scanned order…");
      void resolveSellerOrderByNumberAction(orderNumber).then((result) => {
        if (!result.success) {
          setNotice(result.error);
          return;
        }
        setNotice(null);
        openResolved(result.data);
      });
    },
  });

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
      {notice ? (
        <span role="status" className="basis-full text-xs text-muted-foreground">
          {notice}
        </span>
      ) : null}
      {uploadOpen ? (
        <BarcodeUploadDialog
          onClose={() => setUploadOpen(false)}
          onResolved={(resolution) => {
            setUploadOpen(false);
            openResolved(resolution);
          }}
          onReviewPack={(orderId, summary) => setPackScan({ orderId, summary })}
        />
      ) : null}
      {open ? (
        <BarcodeScannerModal
          themed
          onClose={() => setOpen(false)}
          onDecode={handleDecode}
          onUpload={() => {
            setOpen(false);
            setUploadOpen(true);
          }}
        />
      ) : null}
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
