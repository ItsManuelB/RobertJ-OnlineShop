import Link from "next/link";
import type { Metadata } from "next";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { ChangePasswordForm, PortalAccountForm, SignOutOtherDevicesPanel } from "@/features/account";
import type { AuditLogAction } from "@/features/audit-log/constants/audit-log.constants";
import { ContactSettingsForm, PLATFORM_POLICIES, RecentSettingsChanges } from "@/features/settings";
import { getMyProfile, getPlatformSettings, listAdminActionLog, listUserIdentities, requireSessionUser } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Settings — Admin Portal" };

const SETTINGS_AUDIT_ACTION = "update_platform_settings" satisfies AuditLogAction;

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
 * Admin settings: the admin's own account + password, the storefront support
 * contact (the only platform value persisted today), a read-only reference of
 * the fixed platform policies, and a pointer to the audit log. `/admin/*` is
 * restricted to the admin role by the layout; the contact write re-checks it.
 */
export default async function AdminSettingsPage() {
  const user = await requireSessionUser();
  const [profile, identities, settings, recentChanges] = await Promise.all([
    getMyProfile(),
    listUserIdentities(),
    getPlatformSettings().catch(() => null),
    listAdminActionLog({ page: 1, pageSize: 5, action: SETTINGS_AUDIT_ACTION }).catch(() => null),
  ]);

  if (!profile) {
    return (
      <div className="p-5 lg:p-7">
        <ErrorState message="We couldn't load your account. Try signing out and back in." />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-5 lg:p-7">
      <Section title="My account" description="How you appear in the admin portal.">
        <PortalAccountForm profile={profile} email={user.email} />
      </Section>

      <Section title="Security" description="Change the password you sign in with.">
        <ChangePasswordForm themed hasPassword={identities.some((identity) => identity.provider === "email")} />
        <SignOutOtherDevicesPanel themed />
      </Section>

      <Section title="Store contact" description="Shown in the storefront footer under Help.">
        {settings ? (
          <ContactSettingsForm settings={settings} />
        ) : (
          <ErrorState message="Store contact settings couldn't be loaded. Make sure the latest database migration has been applied." />
        )}
      </Section>

      <Section title="Platform policies" description="Fixed in code today and shown here for reference only.">
        <dl className="divide-y divide-border">
          {PLATFORM_POLICIES.map((policy) => (
            <div key={policy.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <div>
                <dt className="text-sm font-medium text-foreground">{policy.label}</dt>
                <dd className="text-xs text-muted-foreground">{policy.note}</dd>
              </div>
              <dd className="text-sm font-semibold text-foreground">{policy.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Recent settings changes" description="Every settings change is recorded in the audit log.">
        {recentChanges ? (
          <RecentSettingsChanges entries={recentChanges.items} />
        ) : (
          <ErrorState message="Recent changes couldn't be loaded." />
        )}
        <Link
          href={ROUTES.adminAuditLog}
          className="inline-flex min-h-10 w-fit items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          View audit log
        </Link>
      </Section>
    </div>
  );
}
