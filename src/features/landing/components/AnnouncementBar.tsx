"use client";

import { useEffect, useState } from "react";

import { ANNOUNCEMENTS } from "@/features/landing/constants/landing.constants";

/** Slim promo bar that cross-fades between announcements every few seconds. */
export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % ANNOUNCEMENTS.length),
      4000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="overflow-hidden bg-rj-red py-2 text-center text-[11px] font-semibold uppercase tracking-widest text-rj-white">
      <div key={index} style={{ animation: "fadeSlideIn 0.5s ease both" }} aria-live="polite">
        {ANNOUNCEMENTS[index]}
      </div>
    </div>
  );
}
