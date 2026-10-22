import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { ROUTES } from "@/constants/routes";
import { siteConfig } from "@/config/site";
import { getPlatformSettings } from "@/lib/supabase/queries";

/*
 * Instagram / Facebook / TikTok have no Lucide glyphs in this version, so they
 * are the documented exception to the "use Lucide" rule and ship as inline SVGs
 * copied from the approved design.
 */
const SOCIALS: { label: string; icon: ReactNode }[] = [
  {
    label: "Instagram",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2" />
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "TikTok",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 12a4 4 0 104 4V4a5 5 0 005 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const TRUST_BADGES = ["Verified Sellers", "Buyer Protected", "Secure Payments"];

/**
 * The single site-wide footer — mounted by every route group's layout.
 * Every link here goes to a real destination. Sections that had no real
 * destination yet (Sellers/dashboard pages, Sale, legal pages) were cut
 * rather than pointed at a placeholder — see ARCHITECTURE.md Technical Debt
 * Register for what's tracked to add back once those pages exist.
 */
/** Admin-editable contact details; falls back to `siteConfig` so a settings outage never breaks the footer. */
async function loadSupportContact() {
  try {
    const settings = await getPlatformSettings();
    if (settings) {
      return {
        email: settings.supportEmail,
        phone: settings.supportPhone,
        address: settings.businessAddress,
        hours: settings.businessHours,
      };
    }
  } catch {
    // fall through to the static default
  }
  return { email: siteConfig.supportEmail, phone: null, address: null, hours: null };
}

export async function SiteFooter() {
  const support = await loadSupportContact();
  return (
    <footer className="bg-rj-black pb-8 pt-16 text-rj-white">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-10 grid grid-cols-1 gap-10 border-b border-rj-gray-800 pb-12 md:grid-cols-3">
          {/* Brand column */}
          <div>
            <div className="mb-4 flex items-baseline gap-0.5">
              <span className="font-serif text-2xl">RobertJ</span>
              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-rj-red">
                Shop
              </span>
            </div>
            <p className="mb-7 max-w-xs text-[13px] leading-relaxed text-rj-gray-600">
              A centralized multi-shop clothing marketplace for modern Filipino
              shoppers. Verified sellers, quality products, one seamless
              experience.
            </p>
            <div className="mb-8 flex gap-3">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href="#"
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-rj-gray-800 text-rj-gray-600 transition-all hover:border-rj-red hover:text-rj-red"
                >
                  {social.icon}
                </a>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {TRUST_BADGES.map((badge) => (
                <div
                  key={badge}
                  className="flex items-center gap-1.5 rounded-full bg-rj-gray-800 px-3 py-1.5"
                >
                  <ShieldCheck className="h-2.5 w-2.5 text-rj-green" aria-hidden="true" />
                  <span className="text-[10px] text-rj-gray-600">{badge}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shop */}
          <nav aria-label="Shop">
            <h4 className="mb-5 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-600">
              Shop
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href={`${ROUTES.products}?sort=newest`}
                  className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                >
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link
                  href={ROUTES.categories}
                  className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                >
                  All Categories
                </Link>
              </li>
              <li>
                <Link
                  href={`${ROUTES.products}?onSale=true`}
                  className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                >
                  On Sale
                </Link>
              </li>
              <li>
                <Link
                  href={ROUTES.products}
                  className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                >
                  Browse All Products
                </Link>
              </li>
            </ul>
          </nav>

          {/* Help */}
          <nav aria-label="Help">
            <h4 className="mb-5 text-[10px] font-bold uppercase tracking-[0.25em] text-rj-gray-600">
              Help
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href={`mailto:${support.email}`}
                  className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                >
                  Contact Support
                </a>
              </li>
              {support.phone ? (
                <li>
                  <a
                    href={`tel:${support.phone.replace(/[^+\d]/g, "")}`}
                    className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                  >
                    {support.phone}
                  </a>
                </li>
              ) : null}
              {support.hours ? (
                <li className="text-[13px] text-rj-gray-400">{support.hours}</li>
              ) : null}
              {support.address ? (
                <li className="text-[13px] text-rj-gray-400">{support.address}</li>
              ) : null}
              <li>
                <Link
                  href={ROUTES.orders}
                  className="text-[13px] text-rj-gray-400 transition-colors hover:text-rj-white"
                >
                  Track an Order
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <p className="text-center text-[11px] text-rj-gray-600 md:text-left">
          © {new Date().getFullYear()} RobertJ Shop. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
