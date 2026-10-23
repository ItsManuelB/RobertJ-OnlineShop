"use client";

import { useEffect, useRef } from "react";

/** The order number printed under the label barcode: `ORD-YYYYMMDD-NNNNNN`. */
const ORDER_NUMBER = /^ORD-\d{8}-\d{6}$/;
/** A handheld scanner "types" its characters a few ms apart; a person is far slower. */
const MAX_KEY_GAP_MS = 60;
/** Some scanners send no Enter: a complete order number followed by this much quiet counts as a scan. */
const IDLE_SUBMIT_MS = 120;

export interface UseHardwareScannerOptions {
  /** Turn off while a modal is open so a scan can't act behind it. */
  enabled: boolean;
  onScan: (orderNumber: string) => void;
}

/**
 * Listens for a USB/Bluetooth barcode scanner, which behaves like a keyboard:
 * it types the barcode text very quickly and usually presses Enter. Fires
 * `onScan` only for a complete order number typed at scanner speed, so normal
 * typing in the search box (or anywhere) never triggers it. Works whether the
 * search box is focused or not. Never writes anything itself.
 */
export function useHardwareScanner({ enabled, onScan }: UseHardwareScannerOptions) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastKeyAt = 0;
    let fast = true;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const reset = () => {
      buffer = "";
      fast = true;
      if (idleTimer) clearTimeout(idleTimer);
    };
    const submit = () => {
      const candidate = buffer.trim();
      const wasFast = fast;
      reset();
      if (wasFast && ORDER_NUMBER.test(candidate)) onScanRef.current(candidate);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const now = performance.now();

      if (event.key === "Enter" || event.key === "Tab") {
        if (ORDER_NUMBER.test(buffer.trim()) && fast) {
          event.preventDefault();
          submit();
        } else {
          reset();
        }
        return;
      }
      if (event.key.length !== 1) return;

      if (buffer && now - lastKeyAt > MAX_KEY_GAP_MS) reset();
      if (buffer) fast = fast && now - lastKeyAt <= MAX_KEY_GAP_MS;
      buffer += event.key;
      lastKeyAt = now;

      if (idleTimer) clearTimeout(idleTimer);
      if (ORDER_NUMBER.test(buffer)) idleTimer = setTimeout(submit, IDLE_SUBMIT_MS);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [enabled]);
}
