import type { Metadata } from "next";

import { ChangePasswordForm } from "@/features/account/components/ChangePasswordForm";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import { listUserIdentities, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Change Password" };

export default async function ChangePasswordPage() {
  // `proxy.ts` already guards this route; this is the belt-and-suspenders re-check.
  await requireSessionUser();
  const identities = await listUserIdentities();

  return (
    <div className="flex flex-col gap-8">
      <CatalogHeader
        eyebrow="My Account"
        title="Change Password"
        description="Enter your current password, then choose a new one."
      />
      <ChangePasswordForm hasPassword={identities.some((identity) => identity.provider === "email")} />
    </div>
  );
}
