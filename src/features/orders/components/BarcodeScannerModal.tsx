"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Minimal shape of ZXing's IScannerControls we use — kept inline so the
 * `@zxing/browser` module is never statically imported (it loads on demand). */
type ScannerControls = { stop: () => void };

type Phase =
  | "starting"
  | "scanning"
  | "resolving"
  | "error"
  | "denied"
  | "no-camera"
  | "unsupported";

export type BarcodeDecodeResult = { success: true } | { success: false; error: string };

export interface BarcodeScannerModalProps {
  /** Uses portal surface tokens when the scanner is opened inside Seller/Admin. */
  themed?: boolean;
  onClose: () => void;
  /**
   * Called with the decoded Code 128 text once a symbol is read. The modal
   * is purely a camera/decode shell — what a scan *means* (look up and
   * navigate to an order, or confirm the order already on screen) is entirely
   * up to the caller. Resolving `{ success: true }` closes the modal;
   * `{ success: false, error }` shows the error with a "Scan again" retry.
   */
  onDecode: (decoded: string) => Promise<BarcodeDecodeResult>;
  /**
   * Escape hatch for a camera that is confirmed unavailable (permission
   * denied, no device, or unsupported browser) — called instead of
   * `onClose` when the bottom button is pressed in one of those three
   * phases. Omitted: the button always just closes the modal, in every
   * phase (today's behavior, unchanged for callers that don't need an
   * escape hatch). Scanning-while-available is never affected by this —
   * only reached once the camera has already failed to start.
   */
  onNoCameraFallback?: () => void;
  /** Button text shown only while `onNoCameraFallback` is about to be invoked — defaults to `fallbackLabel` if omitted. */
  noCameraFallbackLabel?: string;
  /** Copy overrides for the caller's specific scan purpose. */
  title?: string;
  instructions?: string;
  resolvingLabel?: string;
  fallbackLabel?: string;
}

/**
 * Camera-based Code 128 scanner — dynamically imports `@zxing/browser` only
 * when opened, restricts decoding to Code 128, prefers the rear camera on
 * mobile (integrated webcam on desktop), and hands the decoded text to
 * `onDecode`. Writes nothing itself; every write path belongs to whatever
 * `onDecode` the caller supplies. Cleans up the camera stream on success,
 * close, and unmount, and guards against duplicate scans.
 */
export function BarcodeScannerModal({
  themed = false,
  onClose,
  onDecode,
  onNoCameraFallback,
  noCameraFallbackLabel,
  title = "Scan order barcode",
  instructions = "Point the camera at the Code 128 barcode on the shipping label.",
  resolvingLabel = "Looking up the order…",
  fallbackLabel = "Use manual search",
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const hasScannedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Bumped to (re)start the camera; the start effect keys off this (not
  // `phase`), so moving starting → scanning never tears down a live stream.
  const [attempt, setAttempt] = useState(0);

  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // controls may already be torn down — safe to ignore.
    }
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Callers pass fresh inline callbacks every render (and re-render while the
  // decode is being acted on). Reading the latest ones through a ref keeps
  // `resolve` — and therefore the camera-start effect — stable, so a parent
  // re-render can never tear down and restart a live scan.
  const onDecodeRef = useRef(onDecode);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onDecodeRef.current = onDecode;
    onCloseRef.current = onClose;
  }, [onDecode, onClose]);

  const resolve = useCallback(async (decoded: string) => {
    setPhase("resolving");
    const result = await onDecodeRef.current(decoded);
    if (result.success) {
      onCloseRef.current();
      return;
    }
    setErrorMessage(result.error);
    setPhase("error");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Yield first so every setState below runs asynchronously (never
      // synchronously within the effect body).
      await Promise.resolve();
      if (cancelled) return;

      if (
        typeof window === "undefined" ||
        !window.isSecureContext ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setPhase("unsupported");
        return;
      }

      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
          await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (cancelled) return;

        const videoEl = videoRef.current;
        if (!videoEl) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
        const reader = new BrowserMultiFormatReader(hints);

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoEl,
          (result) => {
            if (!result || hasScannedRef.current) return;
            hasScannedRef.current = true;
            stopCamera();
            void resolve(result.getText());
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setPhase("scanning");
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setPhase("denied");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setPhase("no-camera");
        } else {
          setErrorMessage("The camera couldn't be started.");
          setPhase("error");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [attempt, resolve, stopCamera]);

  function handleClose() {
    stopCamera();
    onClose();
  }

  function handleRetry() {
    hasScannedRef.current = false;
    setErrorMessage(null);
    setPhase("starting");
    setAttempt((value) => value + 1);
  }

  const showVideo = phase === "starting" || phase === "scanning" || phase === "resolving";
  // Only reached once the camera has already failed to start — never
  // short-circuits a scan that's still possible.
  const cameraUnavailable = phase === "denied" || phase === "no-camera" || phase === "unsupported";
  const effectiveFallbackLabel =
    cameraUnavailable && onNoCameraFallback ? (noCameraFallbackLabel ?? fallbackLabel) : fallbackLabel;
  const ink = themed ? "text-foreground" : "text-rj-black";
  const muted = themed ? "text-muted-foreground" : "text-rj-gray-600";

  function handleFallbackClick() {
    stopCamera();
    if (cameraUnavailable && onNoCameraFallback) {
      onNoCameraFallback();
    } else {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    >
      <div className={`w-full max-w-md rounded-xl p-5 shadow-xl ${themed ? "bg-rj-white text-rj-black dark:bg-card dark:text-card-foreground" : "bg-rj-white"}`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-bold ${ink}`}>{title}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close scanner"
            className={`rounded-md p-1 ${themed ? "text-rj-gray-500 hover:bg-rj-gray-100 hover:text-rj-black dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground" : "text-rj-gray-500 hover:bg-rj-gray-100"}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          {/* Always mounted so the ref exists before the start effect runs; hidden unless active. */}
          <div className={cn("overflow-hidden rounded-lg bg-black", showVideo ? "block" : "hidden")}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-square w-full object-cover"
            />
          </div>

          {phase === "starting" ? (
            <p className={`mt-3 text-sm ${muted}`}>Starting camera…</p>
          ) : null}
          {phase === "scanning" ? (
            <p className={`mt-3 text-sm ${muted}`}>{instructions}</p>
          ) : null}
          {phase === "resolving" ? (
            <p className={`mt-3 text-sm ${muted}`}>{resolvingLabel}</p>
          ) : null}

          {phase === "denied" ? (
            <p className={`mt-1 text-sm ${themed ? "text-rj-gray-700 dark:text-foreground" : "text-rj-gray-700"}`}>
              Camera access was blocked. Enable camera permission for this site, or{" "}
              {effectiveFallbackLabel.toLowerCase()}.
            </p>
          ) : null}
          {phase === "no-camera" ? (
            <p className={`mt-1 text-sm ${themed ? "text-rj-gray-700 dark:text-foreground" : "text-rj-gray-700"}`}>No camera was found. {effectiveFallbackLabel} instead.</p>
          ) : null}
          {phase === "unsupported" ? (
            <p className={`mt-1 text-sm ${themed ? "text-rj-gray-700 dark:text-foreground" : "text-rj-gray-700"}`}>
              Camera scanning isn&apos;t available in this browser. {effectiveFallbackLabel} instead.
            </p>
          ) : null}
          {phase === "error" ? (
            <p className={`mt-1 text-sm ${themed ? "text-rj-red-dark dark:text-danger" : "text-rj-red-dark"}`}>{errorMessage}</p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {phase === "error" || phase === "denied" ? (
            <Button type="button" variant="primary" size="rjSm" onClick={handleRetry}>
              Scan again
            </Button>
          ) : null}
          <button
            type="button"
            onClick={handleFallbackClick}
            className={cn(buttonVariants({ variant: "outline", size: "rjSm" }))}
          >
            {effectiveFallbackLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
