"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A short-lived "just saved" flag for changes that save the moment they are
 * made (so the person knows it worked without a Save button). `flash()` turns
 * it on and it turns itself off again after `durationMs`.
 */
export function useSavedFlash(durationMs = 2500): { saved: boolean; flash: () => void } {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), durationMs);
  }, [durationMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { saved, flash };
}
