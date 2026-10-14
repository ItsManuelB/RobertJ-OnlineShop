import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { ErrorState } from "@/components/feedback/ErrorState";
import { ROUTES } from "@/constants/routes";
import { AccountStatusPanel } from "@/features/account/components/AccountStatusPanel";
import { ConnectedAccounts } from "@/features/account/components/ConnectedAccounts";
import { DownloadMyDataPanel } from "@/features/account/components/DownloadMyDataPanel";
import { DefaultAddressPicker } from "@/features/account/components/DefaultAddressPicker";
import { DefaultPaymentMethodPicker } from "@/features/account/components/DefaultPaymentMethodPicker";
import { NotificationPreferencesPanel } from "@/features/account/components/NotificationPreferencesPanel";
import { SignOutOtherDevicesPanel } from "@/features/account/components/SignOutOtherDevicesPanel";
import { CatalogHeader } from "@/features/products/components/CatalogHeader";
import { mapOAuthCallbackError } from "@/features/auth";
import {
  getMyBuyerPreferences,
  listMyAddresses,
  listUserIdentities,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Privacy & Settings" };

interface PrivacyPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SECTION_CLASS = "flex flex-col gap-4 rounded-2xl border border-rj-gray-100 p-5";

/**
 * Buyer settings hub, organized Shopee-style into essential sections only —
 * Account (Connected Accounts), Notifications, Orders (default address +
 * payment method), Security (Change Password, sign out of other devices), Your data (download), and Account Status. Every
 * setting here reads/writes a real backend value (see each panel's own
 * comment) — nothing on this page is a hardcoded status or a UI-only toggle.
 */
export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const params = await searchParams;
  const user = await requireSessionUser();
  const [identities, preferences, addresses] = await Promise.all([
    listUserIdentities(),
    getMyBuyerPreferences(user.id),
    listMyAddresses(user.id),
  ]);

  const errorParam = typeof params.error === "string" ? params.error : null;
  const linkError = mapOAuthCallbackError(errorParam);

  return (
    <div className="flex flex-col gap-8">
      <CatalogHeader
        eyebrow="My Account"
        title="Privacy & Settings"
        description="Manage your account, notifications, and order preferences."
      />
      <div className="flex max-w-xl flex-col gap-6">
        {linkError ? (
          <ErrorState title="Couldn't connect that account" message={linkError} />
        ) : null}

        <section className={SECTION_CLASS} aria-label="Account">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
            Account
          </h2>
          <ConnectedAccounts identities={identities} />
        </section>

        <section className={SECTION_CLASS} aria-label="Notifications">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
            Notifications
          </h2>
          <NotificationPreferencesPanel initialPreferences={preferences} />
        </section>

        <section className={SECTION_CLASS} aria-label="Orders">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
            Orders
          </h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-rj-black">Default Delivery Address</span>
            <DefaultAddressPicker addresses={addresses} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-rj-black">Default Payment Method</span>
            <DefaultPaymentMethodPicker initialValue={preferences.defaultPaymentMethod} />
          </div>
          <p className="text-xs text-rj-gray-600">
            Order update notifications are managed above, under Notifications.
          </p>
        </section>

        <section className={SECTION_CLASS} aria-label="Security">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
            Security
          </h2>
          <Link
            href={ROUTES.changePassword}
            className="flex items-center gap-2.5 rounded-xl px-1 py-1 text-sm font-medium text-rj-black transition-colors hover:text-rj-red-dark"
          >
            <span className="flex-1">Change Password</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
          <SignOutOtherDevicesPanel />
        </section>

        <section className={SECTION_CLASS} aria-label="Your data">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
            Your data
          </h2>
          <DownloadMyDataPanel />
        </section>

        <section className={SECTION_CLASS} aria-label="Account Status">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-rj-gray-500">
            Account Status
          </h2>
          <AccountStatusPanel isActive={user.isActive} />
        </section>
      </div>
    </div>
  );
}
