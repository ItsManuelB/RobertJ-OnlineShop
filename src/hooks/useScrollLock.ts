"use client";

import { useEffect } from "react";

/**
 * Locks background page scroll while `locked` is true (an open modal, bottom
 * sheet, or lightbox), restoring the previous `overflow` on unlock/unmount.
 * Ref-counted so multiple simultaneously-open overlays don't fight over the
 * style — the lock lifts only once the last one releases it.
 *
 * The lock goes on `<html>`, not `<body>`: `<html>` carries `overflow-x: clip`
 * (see the root layout), and when the root's overflow isn't `visible` a
 * `body { overflow: hidden }` is NOT handed to the viewport. `<body>` then
 * becomes its own scroll container, the window keeps scrolling underneath, and
 * every `position: sticky` bar (the portal sidebar and top bar) scrolls away
 * with the page. Locking `<html>` locks the viewport itself.
 */
let lockCount = 0;
let previousOverflow = "";

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    const root = document.documentElement;
    if (lockCount === 0) {
      previousOverflow = root.style.overflow;
      root.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        root.style.overflow = previousOverflow;
      }
    };
  }, [locked]);
}
