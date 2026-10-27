"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";

import { updateSellerAlertPreferencesAction } from "../actions/seller-settings.actions";
import type { SellerAlertPreferences } from "../utils/seller-tasks";

const ROWS: { key: keyof SellerAlertPreferences; label: string; description: string }[] = [
  { key: "orders", label: "New and unshipped orders", description: "Orders to confirm and orders waiting to be packed or shipped." },
  { key: "returns", label: "Return requests", description: "Requests to answer, parcels to receive and returned items to record." },
  { key: "payments", label: "Payments", description: "Cash still to collect on shipped cash-on-delivery orders." },
  { key: "lowStock", label: "Low stock", description: "Products that are out of stock or running low." },
];

/**
 * Settings > Alerts. Each switch is a persisted `seller_preferences` column that
 * decides whether that kind of task appears in the Dashboard's "Needs your
 * attention" cards and the topbar bell. It only hides reminders; the underlying
 * orders, returns and stock are unchanged.
 */
export function SellerAlertPreferencesPanel({ initialPreferences }: { initialPreferences: SellerAlertPreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pendingKey, setPendingKey] = useState<keyof SellerAlertPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(key: keyof SellerAlertPreferences, value: boolean) {
    if (isPending) return;
    setError(null);
    setPendingKey(key);
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [key]: value }));
    startTransition(async () => {
      const result = await updateSellerAlertPreferencesAction({ [key]: value });
      if (!result.success) {
        setPreferences(previous);
        setError(result.error);
      }
      setPendingKey(null);
    });
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {ROWS.map((row) => (
        <label key={row.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{row.label}</span>
            <span className="text-xs text-muted-foreground">{row.description}</span>
          </span>
          <Checkbox
            checked={preferences[row.key]}
            disabled={isPending && pendingKey === row.key}
            onChange={(event) => handleToggle(row.key, event.target.checked)}
            className="mt-0.5"
          />
        </label>
      ))}
      <p className="pt-3 text-xs text-muted-foreground">
        Turning an alert off hides it from your dashboard and the bell. Nothing about the orders, returns or stock changes.
      </p>
      {error ? (
        <p className="pt-3 text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
