"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ImagePlus, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import {
  resolveSellerOrdersByNumbersAction,
  type ScannedOrderResolution,
  type ScannedOrderSummary,
} from "@/features/orders/actions/order.actions";
import { getOrderStatusLabel } from "@/features/orders/constants/order.constants";
import { MAX_SCAN_BATCH, scanOrderNumberSchema } from "@/features/orders/schemas/order.schema";
import { decodeBarcodeFromFile } from "@/features/orders/utils/decode-barcode-image";
import { cn } from "@/lib/utils/cn";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

type RowState = "reading" | "unreadable" | "invalid" | "lookup" | "found" | "missing" | "failed";

interface Row {
  id: string;
  name: string;
  state: RowState;
  orderNumber?: string;
  resolution?: ScannedOrderResolution;
  message?: string;
}

export interface BarcodeUploadDialogProps {
  onClose: () => void;
  /** Exactly one photo that matched an order: act on it straight away, like a live scan. */
  onResolved: (resolution: ScannedOrderResolution) => void;
  /** A To Pack order from the list: open its confirm popup, keeping the list. */
  onReviewPack: (orderId: string, summary: ScannedOrderSummary) => void;
}

const STATE_TEXT: Record<RowState, string> = {
  reading: "Reading barcode…",
  unreadable: "Couldn't read a barcode in this photo. Retake it closer and in focus, or search by order number.",
  invalid: "That doesn't look like a RobertJ order barcode.",
  lookup: "Looking up the order…",
  found: "",
  missing: "Order not found, or it isn't in your shop.",
  failed: "Couldn't open this image.",
};

/**
 * "Upload barcode" for the seller Orders list: pick or take photos of shipping
 * labels (or drop screenshots) and the barcode is read in the browser, then
 * the orders are looked up in one request. Nothing is changed by reading: one
 * matching photo opens the order like a live scan; several photos show a list
 * the seller reviews, and a To Pack order still asks for confirmation first.
 */
export function BarcodeUploadDialog({ onClose, onResolved, onReviewPack }: BarcodeUploadDialogProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // `capture` only opens the camera on phones/tablets; on a computer it just opens the file chooser,
  // so "Take photo" would look identical to "Choose photos" there (the live scanner covers webcams).
  // The dialog only mounts after a click (never server-rendered), so reading the media query here is safe.
  const [canCapture] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const runId = useRef(0);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [onClose]);

  function patch(id: string, update: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...update } : row)));
  }

  async function handleFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    const images = incoming.filter((file) => file.type.startsWith("image/") && file.size <= MAX_FILE_BYTES);
    const skipped = incoming.length - images.length;
    const accepted = images.slice(0, MAX_SCAN_BATCH);
    const notes: string[] = [];
    if (skipped > 0) notes.push(`${skipped} file${skipped === 1 ? " was" : "s were"} skipped (images up to 15 MB only).`);
    if (images.length > accepted.length) notes.push(`Only the first ${MAX_SCAN_BATCH} photos are read at once.`);
    setNotice(notes.length > 0 ? notes.join(" ") : null);
    if (accepted.length === 0) return;

    const run = ++runId.current;
    const initial: Row[] = accepted.map((file, index) => ({
      id: `${run}-${index}`,
      name: file.name || `Photo ${index + 1}`,
      state: "reading",
    }));
    setRows(initial);
    setBusy(true);

    // Decode one at a time: large photos are CPU-heavy and a phone would stall on several at once.
    const decoded: Array<{ id: string; orderNumber: string }> = [];
    for (let index = 0; index < accepted.length; index += 1) {
      const row = initial[index];
      const result = await decodeBarcodeFromFile(accepted[index]);
      if (runId.current !== run) return;
      if (!result.ok) {
        patch(row.id, { state: result.reason === "load" ? "failed" : "unreadable" });
        continue;
      }
      const parsed = scanOrderNumberSchema.safeParse({ orderNumber: result.text });
      if (!parsed.success) {
        patch(row.id, { state: "invalid" });
        continue;
      }
      patch(row.id, { state: "lookup", orderNumber: parsed.data.orderNumber });
      decoded.push({ id: row.id, orderNumber: parsed.data.orderNumber });
    }

    if (decoded.length === 0) {
      setBusy(false);
      return;
    }

    const lookup = await resolveSellerOrdersByNumbersAction(decoded.map((item) => item.orderNumber));
    if (runId.current !== run) return;
    setBusy(false);

    if (!lookup.success) {
      for (const item of decoded) patch(item.id, { state: "failed", message: lookup.error });
      return;
    }

    const byNumber = new Map(lookup.data.map((entry) => [entry.orderNumber, entry]));
    for (const item of decoded) {
      const entry = byNumber.get(item.orderNumber);
      if (entry?.found) {
        patch(item.id, {
          state: "found",
          resolution: { orderId: entry.orderId, status: entry.status, summary: entry.summary },
        });
      } else {
        patch(item.id, { state: "missing" });
      }
    }

    // One photo that matched: act like a live scan instead of making the seller tap again.
    if (accepted.length === 1) {
      const only = decoded[0] ? byNumber.get(decoded[0].orderNumber) : undefined;
      if (only?.found) onResolved({ orderId: only.orderId, status: only.status, summary: only.summary });
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    void handleFiles(event.target.files ?? []);
    event.target.value = ""; // allow re-picking the same file
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Upload barcode photos" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl bg-card p-5 text-card-foreground shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Upload barcode photos</h2>
            <p className="text-xs text-muted-foreground">
              Take or choose photos of shipping labels. The barcode is read on your device, so you don&apos;t have to hold the camera steady.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-5 text-center",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <div className="flex flex-wrap justify-center gap-2">
            {canCapture ? (
              <Button type="button" variant="primary" size="rjSm" onClick={() => cameraInput.current?.click()} disabled={busy}>
                <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
                Take photo
              </Button>
            ) : null}
            <Button
              type="button"
              variant={canCapture ? "outline" : "primary"}
              size="rjSm"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Choose photos
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Up to {MAX_SCAN_BATCH} images at once, or drop them here.{canCapture ? "" : " On a phone, this dialog also offers Take photo."}</p>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo of a barcode" onChange={onPick} />
          <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Choose barcode photos" onChange={onPick} />
        </div>

        {notice ? <p role="status" className="text-xs text-muted-foreground">{notice}</p> : null}

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground">{row.name}</span>
                  {row.orderNumber ? <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{row.orderNumber}</span> : null}
                </div>
                {row.state === "found" && row.resolution ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{getOrderStatusLabel(row.resolution.status)}</span>
                    {row.resolution.summary ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="rjSm"
                        onClick={() => row.resolution?.summary && onReviewPack(row.resolution.orderId, row.resolution.summary)}
                      >
                        Review &amp; pack
                      </Button>
                    ) : (
                      <Link
                        href={
                          row.resolution.status === "processing"
                            ? `${ROUTES.sellerOrderDetail(row.resolution.orderId)}?scan=ship`
                            : ROUTES.sellerOrderDetail(row.resolution.orderId)
                        }
                        className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
                      >
                        {row.resolution.status === "processing" ? "Open to ship" : "Open order"}
                      </Link>
                    )}
                  </div>
                ) : (
                  <p
                    role={row.state === "reading" || row.state === "lookup" ? "status" : undefined}
                    className={cn("text-xs", row.state === "reading" || row.state === "lookup" ? "text-muted-foreground" : "font-semibold text-danger")}
                  >
                    {row.message ?? STATE_TEXT[row.state]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
