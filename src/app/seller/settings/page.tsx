import Link from "next/link";
import type { Metadata } from "next";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { SellerAccountForm } from "@/features/seller/components/SellerAccountForm";
import { SellerSecurityForm } from "@/features/seller/components/SellerSecurityForm";
import { getMyProfile, getOwnShopId, getShopById, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Settings — Seller Portal" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Seller's own settings: account details, password, and a read-only summary of
 * their shop. The seller layout already restricts `/seller/*` to the seller
 * role; every write below is on the signed-in user's own profile.
 */
export default async function SellerSettingsPage() {
  const user = await requireSessionUser();
  const [profile, shopId] = await Promise.all([getMyProfile(), getOwnShopId(user.id)]);
  const shop = shopId ? await getShopById(shopId) : null;

  if (!profile) {
    return (
      <div className="p-5 lg:p-7">
        <ErrorState message="We couldn't load your account. Try signing out and back in." />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-5 lg:p-7">
      <Section title="Account" description="How you appear in the seller portal.">
        <SellerAccountForm profile={profile} email={user.email} />
      </Section>

      <Section title="Security" description="Change the password you sign in with.">
        <SellerSecurityForm />
      </Section>

      <Section title="My shop">
        {shop ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{shop.name}</p>
              <p className="text-xs text-muted-foreground">
                {shop.active ? "Active" : "Inactive"} · The shop name and status are managed by an administrator.
              </p>
            </div>
            <Link href={ROUTES.sellerShop} className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
              Edit shop branding
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t linked to a shop yet. Contact an administrator to get set up.
          </p>
        )}
      </Section>
    </div>
  );
}
