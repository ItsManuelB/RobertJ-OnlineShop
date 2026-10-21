import { MARQUEE_ITEMS } from "@/features/landing/constants/landing.constants";

/**
 * Infinite trust-signal marquee. Pure CSS animation (no JS), so it stays a
 * Server Component. Tripled content makes the -33.33% translate loop seamless.
 * Marked decorative — the same phrases appear as real content elsewhere.
 */
export function MarqueeBand() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <div className="overflow-hidden bg-rj-red py-3.5" aria-hidden="true">
      <div
        className="flex whitespace-nowrap"
        style={{ animation: "marquee 22s linear infinite" }}
      >
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-4 px-6 text-[11px] font-bold uppercase tracking-[0.2em] text-rj-white"
          >
            {item}
            <span className="h-1 w-1 rounded-full bg-white/50" />
          </span>
        ))}
      </div>
    </div>
  );
}
