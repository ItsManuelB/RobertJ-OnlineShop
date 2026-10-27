import Link from "next/link";
import type { Metadata } from "next";

import { ErrorState } from "@/components/feedback/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import {
  ChangePasswordForm,
  PortalAccountForm,
  SignOutOtherDevicesPanel,
} from "@/features/account";
import type { AuditLogAction } from "@/features/audit-log/constants/audit-log.constants";
import {
  ContactSettingsForm,
  DefaultLowStockThresholdForm,
  PLATFORM_POLICIES,
  RecentSettingsChanges,
} from "@/features/settings";
import { getInitials } from "@/lib/utils/format";
import {
  getMyProfile,
  getPlatformSettings,
  listAdminActionLog,
  listUserIdentities,
  requireSessionUser,
} from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Settings — Admin Portal" };

const SETTINGS_AUDIT_ACTION =
  "update_platform_settings" satisfies AuditLogAction;

const SECTION_LINKS = [
  { href: "#profile", label: "Profile" },
  { href: "#security", label: "Security" },
  { href: "#contact", label: "Store contact" },
  { href: "#policies", label: "Platform policies" },
  { href: "#changes", label: "Recent changes" },
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
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Admin settings: the admin's own account + password, the storefront support
 * contact, editable default inventory threshold, a read-only reference of
 * other fixed platform policies, and a pointer to the audit log. `/admin/*` is
 * restricted to the admin role by the layout; the contact write re-checks it.
 */
export default async function AdminSettingsPage() {
  const user = await requireSessionUser();
  const [profile, identities, settings, recentChanges] = await Promise.all([
    getMyProfile(),
    listUserIdentities(),
    getPlatformSettings().catch(() => null),
    listAdminActionLog({
      page: 1,
      pageSize: 5,
      action: SETTINGS_AUDIT_ACTION,
    }).catch(() => null),
  ]);

  if (!profile) {
    return (
      <div className="p-5 lg:p-7">
        <ErrorState message="We couldn't load your account. Try signing out and back in." />
      </div>
    );
  }

  const displayName = profile.fullName?.trim() || user.email;

  return (
    <div className="flex flex-col gap-5 p-5 lg:p-7">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Your account, sign-in security, the storefront contact and the
          platform defaults.
        </p>
      </div>

      <Card className="border-border">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-semibold text-primary-foreground"
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- small Storage avatar; no layout shift
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(displayName)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">
              {displayName}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Badge tone="info">Administrator</Badge>
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
          <Section
            id="profile"
            title="Profile"
            description="How you appear in the admin portal."
          >
            <PortalAccountForm profile={profile} email={user.email} />
          </Section>

          <Section
            id="security"
            title="Security"
            description="Change the password you sign in with."
          >
            <ChangePasswordForm
              themed
              hasPassword={identities.some(
                (identity) => identity.provider === "email",
              )}
            />
            <SignOutOtherDevicesPanel themed />
          </Section>

          <Section
            id="contact"
            title="Store contact"
            description="Shown in the storefront footer under Help."
          >
            {settings ? (
              <ContactSettingsForm settings={settings} />
            ) : (
              <ErrorState message="Store contact settings couldn't be loaded. Make sure the latest database migration has been applied." />
            )}
          </Section>

          <Section
            id="policies"
            title="Platform policies"
            description="Set the default low-stock threshold; other policies are fixed."
          >
            <dl className="divide-y divide-border">
              {PLATFORM_POLICIES.map((policy) => (
                <div
                  key={policy.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
                >
                  <div>
                    <dt className="text-sm font-medium text-foreground">
                      {policy.label}
                    </dt>
                    <dd className="text-xs text-muted-foreground">
                      {policy.note}
                    </dd>
                  </div>
                  <dd className="text-sm font-semibold text-foreground">
                    {policy.value}
                  </dd>
                </div>
              ))}
            </dl>
            {settings ? (
              <DefaultLowStockThresholdForm settings={settings} />
            ) : (
              <ErrorState message="The low-stock threshold couldn't be loaded. Make sure the latest database migration has been applied." />
            )}
          </Section>

          <Section
            id="changes"
            title="Recent settings changes"
            description="Every settings change is recorded in the audit log."
          >
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
      </div>
    </div>
  );
}
