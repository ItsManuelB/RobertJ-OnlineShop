// Public surface of the landing feature. Consumed only by the marketing route
// group (Server Components), so it is safe to co-export the server sections
// (which import server-only services) alongside the client chrome.
//
// Header/footer chrome moved to the shared, site-wide `SiteHeader`/`SiteFooter`
// (src/components/layout) — see ARCHITECTURE.md. LandingNavbar/LandingFooter
// were retired, not exported here.
export { AnnouncementBar } from "./components/AnnouncementBar";
export { Hero } from "./components/Hero";
export { MarqueeBand } from "./components/MarqueeBand";
export { FeaturedShops } from "./components/FeaturedShops";
export { ProductCategories } from "./components/ProductCategories";
export { FeaturedProducts } from "./components/FeaturedProducts";
export { EditorialBanner } from "./components/EditorialBanner";
export { AboutSection } from "./components/AboutSection";
export { OurStorySection } from "./components/OurStorySection";
export { MarketplaceFeatures } from "./components/MarketplaceFeatures";
export { SmartAssistantPreview } from "./components/SmartAssistantPreview";
export { BackToTop } from "./components/BackToTop";
