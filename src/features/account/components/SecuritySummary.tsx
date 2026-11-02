import type { UserIdentity } from "@supabase/supabase-js";

import { Badge } from "@/components/ui/badge";
import { RJ_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email",
  google: "Google",
  facebook: "Facebook",
};

export interface SecuritySummaryProps {
  identities: UserIdentity[];
  isActive: boolean;
}

/** Four-tile read of the account's security, built from data the page already loads. */
export function SecuritySummary({ identities, isActive }: SecuritySummaryProps) {
  const hasPassword = identities.some((identity) => identity.provider === "email");
  const methods = identities.map((identity) => PROVIDER_LABELS[identity.provider] ?? identity.provider);

  return (
    <section aria-label="Security summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className={cn(RJ_CARD, "flex flex-col items-start gap-1.5 p-4")}>
        <p className="text-xs font-semibold text-rj-black">Password</p>
        <Badge tone={hasPassword ? "success" : "warning"}>{hasPassword ? "Set" : "Not set"}</Badge>
      </div>
      <div className={cn(RJ_CARD, "flex flex-col items-start gap-1.5 p-4")}>
        <p className="text-xs font-semibold text-rj-black">Sign-in methods</p>
        <p className="text-xs text-rj-gray-600">{methods.length > 0 ? methods.join(", ") : "None found"}</p>
      </div>
      <div className={cn(RJ_CARD, "flex flex-col items-start gap-1.5 p-4")}>
        <p className="text-xs font-semibold text-rj-black">Account</p>
        <Badge tone={isActive ? "success" : "danger"}>{isActive ? "Active" : "Inactive"}</Badge>
      </div>
      <div className={cn(RJ_CARD, "flex flex-col items-start gap-1.5 p-4")}>
        <p className="text-xs font-semibold text-rj-black">Other devices</p>
        <a href="#security" className="text-xs font-semibold text-rj-red-dark hover:underline">
          Sign out anywhere
        </a>
      </div>
    </section>
  );
}
