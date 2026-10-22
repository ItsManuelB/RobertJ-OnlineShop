import { siteConfig } from "@/config/site";

/** Formats an ISO timestamp as a readable date. */
export function formatDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  return new Intl.DateTimeFormat(siteConfig.locale, options).format(
    new Date(isoDate),
  );
}

/** Whole days elapsed since an ISO timestamp (never negative). */
export function daysSince(isoDate: string, now: number = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 86_400_000));
}

/** Formats an ISO timestamp as a date and time. */
export function formatDateTime(isoDate: string) {
  return formatDate(isoDate, { dateStyle: "medium", timeStyle: "short" });
}
