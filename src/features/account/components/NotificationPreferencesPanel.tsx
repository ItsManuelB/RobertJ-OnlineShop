"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { updateBuyerPreferencesAction } from "@/features/account/actions/account.actions";
import type { BuyerPreferences } from "@/features/account/types/account.types";

type ToggleKey = "orderUpdates" | "promotions" | "pushEnabled" | "emailEnabled" | "smsEnabled";

const ROWS: { key: ToggleKey; label: string; description: string }[] = [
  {
    key: "orderUpdates",
    label: "Order Updates",
    description: "Controls whether your Notifications page shows order/payment activity.",
  },
];

/**
 * `/privacy`'s Notifications section. Every toggle here is a real,
 * RLS-scoped, persisted `buyer_preferences` column — not local React state.
 * `orderUpdates` is the one wired to something real today (gates
 * `/notifications`'s activity feed). The promotions / push / email / SMS
 * columns still exist but have no delivery mechanism, so they are hidden
 * rather than shown as switches implying a channel this app doesn't have.
 */
export function NotificationPreferencesPanel({
  initialPreferences,
}: {
  initialPreferences: BuyerPreferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pendingKey, setPendingKey] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(key: ToggleKey, value: boolean) {
    if (isPending) return;
    setError(null);
    setPendingKey(key);
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      const result = await updateBuyerPreferencesAction({ [key]: value });
      if (!result.success) {
        setPreferences(previous);
        setError(result.error);
      }
      setPendingKey(null);
    });
  }

  return (
    <div className="flex flex-col divide-y divide-rj-gray-100">
      {ROWS.map((row) => (
        <label
          key={row.key}
          className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-rj-black">{row.label}</span>
            </span>
            <span className="text-xs text-rj-gray-600">{row.description}</span>
          </span>
          <Checkbox
            checked={preferences[row.key]}
            disabled={isPending && pendingKey === row.key}
            onChange={(event) => handleToggle(row.key, event.target.checked)}
            className="mt-0.5"
          />
        </label>
      ))}
      <p className="pt-3 text-xs text-rj-gray-600">
        Push, email and SMS alerts aren&apos;t available yet — they&apos;ll appear here when they are.
      </p>
      {error ? (
        <p className="pt-3 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
