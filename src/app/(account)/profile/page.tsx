import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, MapPin } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import { ProfileForm } from "@/features/account/components/ProfileForm";
import { getMyProfile, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireSessionUser();
  const profile = await getMyProfile();

  return (
    <div className="flex flex-col gap-8">
      <CatalogHeader
        eyebrow="My Account"
        title="Profile"
        description="Keep your account details up to date."
      />
      {profile ? (
        <div className="flex max-w-5xl flex-col gap-3">
          <ProfileForm profile={profile} email={user.email} />
          {/* Small secondary shortcut — Addresses management lives on its own page. */}
          <Link
            href={ROUTES.addresses}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-rj-gray-600 transition-colors hover:bg-rj-gray-50 hover:text-rj-black"
          >
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">Manage delivery addresses</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ErrorState message="We couldn't load your profile. Try signing out and back in." />
      )}
    </div>
  );
}
