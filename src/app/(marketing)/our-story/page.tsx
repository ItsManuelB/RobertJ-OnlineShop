import type { Metadata } from "next";

import { OurStorySection } from "@/features/landing";

export const metadata: Metadata = { title: "Our Story" };

export default function OurStoryPage() {
  return <OurStorySection />;
}
