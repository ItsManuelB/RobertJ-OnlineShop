"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

/** Floating scroll-to-top control that appears once the user scrolls down. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-rj-red text-rj-white shadow-lg shadow-rj-red/30 transition-all duration-300 hover:bg-rj-red-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rj-white focus-visible:ring-offset-2 focus-visible:ring-offset-rj-red ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
