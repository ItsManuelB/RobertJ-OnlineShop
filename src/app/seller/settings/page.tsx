import Link from "next/link";
import type { Metadata } from "next";
import { Check, Circle } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { ChangePasswordForm, PortalAccountForm, SignOutOtherDevicesPanel } from "@/features/account";
import { SellerAlertPreferencesPanel } from "@/features/seller/components/SellerAlertPreferencesPanel";
import { SellerDownloadDataPanel } from "@/features/seller/components/SellerDownloadDataPanel";
import { getMyProfile, getMySellerPreferences, getOwnShopId, getShopById, listUserIdentities, requireSessionUser } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";
import { getInitials } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Settings — Seller Portal" };

const SECTION_LINKS = [
  { href: "#profile", label: "Profile" },
  { href: "#security", label: "Security" },
  { href: "#shop", label: "Shop" },
  { href: "#alerts", label: "Alerts" },
  { href: "#data", label: "Your data" },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24 border-border">
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
 * Seller's own settings: who they are (profile header), account details,
 * sign-in security, and a summary of their shop with a short setup checklist.
 * The seller layout already restricts `/seller/*` to the seller role; every
 * write below is on the signed-in user's own profile.
 */
export default async function SellerSettingsPage() {
  const user = await requireSessionUser();
  const [profile, shopId, identities, alertPreferences] = await Promise.all([
    getMyProfile(),
    getOwnShopId(user.id),
    listUserIdentities(),
    getMySellerPreferences(user.id),
  ]);
  const shop = shopId ? await getShopById(shopId) : null;

  if (!profile) {
    return (
      <div className="p-5 lg:p-7">
        <ErrorState message="We couldn't load your account. Try signing out and back in." />
      </div>
    );
  }

  const displayName = profile.fullName?.trim() || user.email;
  const checklist = shop
    ? [
        { label: "Logo added", done: Boolean(shop.logoUrl) },
        { label: "Banner added", done: Boolean(shop.bannerUrl) },
        { label: "Description written", done: Boolean(shop.description?.trim()) },
      ]
    : [];
  const doneCount = checklist.filter((step) => step.done).length;

  return (
    <div className="flex flex-col gap-5 p-5 lg:p-7">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground">Your account, sign-in security, shop summary, alerts and data.</p>
      </div>

      <Card className="border-border">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground"
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small Storage avatar; no layout shift
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials(displayName)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">Shop Owner</Badge>
            {shop ? <Badge tone={shop.active ? "success" : "neutral"}>{shop.name}</Badge> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-2 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:self-start lg:overflow-visible"
        >
          {SECTION_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 max-w-3xl flex-col gap-5">
          <Section id="profile" title="Profile" description="How you appear in the seller portal.">
            <PortalAccountForm profile={profile} email={user.email} />
          </Section>

          <Section id="security" title="Security" description="Your password and where you're signed in.">
            <ChangePasswordForm themed hasPassword={identities.some((identity) => identity.provider === "email")} />
            <div className="border-t border-border pt-4">
              <SignOutOtherDevicesPanel themed />
            </div>
          </Section>

          <Section id="shop" title="My shop">
            {shop ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{shop.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {shop.active ? "Active" : "Inactive"} · The shop name and status are managed by an administrator.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={ROUTES.shopCatalog(shop.id)}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      View public page
                    </Link>
                    <Link href={ROUTES.sellerShop} className={buttonVariants({ variant: "primary", size: "sm" })}>
                      Edit branding
                    </Link>
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Shop profile · {doneCount} of {checklist.length} done
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {checklist.map((step) => (
                      <li key={step.label} className="flex items-center gap-2 text-sm">
                        {step.done ? (
                          <Check className="h-4 w-4 text-success" aria-hidden="true" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className={cn(step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your account isn&apos;t linked to a shop yet. Contact an administrator to get set up.
              </p>
            )}
          </Section>

          <Section id="alerts" title="Alerts" description="Choose which reminders appear on your dashboard and in the bell.">
            <SellerAlertPreferencesPanel initialPreferences={alertPreferences} />
          </Section>

          <Section id="data" title="Your data">
            <SellerDownloadDataPanel />
          </Section>
        </div>
      </div>
    </div>
  );
}
