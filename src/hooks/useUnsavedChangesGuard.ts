"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Warns before unsaved work is lost. While `dirty`:
 *  - closing or reloading the tab asks the browser to confirm;
 *  - clicking any in-app link is held back and its destination exposed as
 *    `blockedHref`, so the page can show its own "Leave without saving?"
 *    panel (`confirmLeave` goes there, `stay` dismisses it).
 * Not covered: the browser's Back button (an in-app navigation the page is
 * never told about).
 */
export function useUnsavedChangesGuard(dirty: boolean): {
  blockedHref: string | null;
  confirmLeave: () => void;
  stay: () => void;
} {
  const router = useRouter();
  const [blockedHref, setBlockedHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page (a section anchor, say): nothing is lost.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setBlockedHref(`${url.pathname}${url.search}${url.hash}`);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase, so this runs before the framework's own link handling.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return {
    blockedHref,
    confirmLeave: () => {
      const href = blockedHref;
      setBlockedHref(null);
      if (href) router.push(href);
    },
    stay: () => setBlockedHref(null),
  };
}
