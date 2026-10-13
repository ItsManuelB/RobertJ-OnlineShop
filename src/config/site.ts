export const siteConfig = {
  name: "Roberj Shop",
  description: "Multi-vendor marketplace for browsing, buying, and managing products.",
  locale: "en-PH",
  currency: "PHP",
  supportEmail: "support@roberj.example",
} as const;

export type SiteConfig = typeof siteConfig;
