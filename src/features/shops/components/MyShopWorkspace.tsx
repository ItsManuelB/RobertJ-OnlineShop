"use client";

import { Check, ImageIcon, Lock } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShopBrandingForm } from "@/features/shops/components/ShopBrandingForm";
import { ShopImageUploader } from "@/features/shops/components/ShopImageUploader";
import type { Shop } from "@/features/shops/types/shop.types";

export interface MyShopWorkspaceProps {
  shop: Shop;
}

/**
 * Owns the three branding values the page shows twice — once as editors, once
 * in the "How buyers see it" preview and profile meter — so the preview
 * follows edits without a round trip. Persistence stays in the existing
 * actions (`ShopImageUploader`, `ShopBrandingForm`); this only mirrors values.
 */
export function MyShopWorkspace({ shop }: MyShopWorkspaceProps) {
  const [bannerUrl, setBannerUrl] = useState(shop.bannerUrl);
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);
  const [description, setDescription] = useState(shop.description ?? "");

  const trimmed = description.trim();
  const steps = [
    { label: "Logo", done: Boolean(logoUrl) },
    { label: "Banner", done: Boolean(bannerUrl) },
    { label: "Description", done: trimmed.length > 0 },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:order-2" aria-label="Preview and profile">
        <Card className="border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              How buyers see it
            </span>
            <Badge tone="success">Live</Badge>
          </div>
          <CardContent className="p-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {bannerUrl ? (
                <div className="relative aspect-[3/1] w-full bg-muted">
                  <Image src={bannerUrl} alt="" fill className="object-cover" sizes="360px" />
                </div>
              ) : null}
              <div className="flex items-center gap-3 p-4">
                <div
                  className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted text-muted-foreground ${
                    bannerUrl ? "-mt-8" : ""
                  }`}
                >
                  {logoUrl ? (
                    <Image src={logoUrl} alt={`${shop.name} logo`} fill className="object-cover" sizes="56px" />
                  ) : (
                    <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">{shop.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {trimmed || "No description yet. Buyers will see only your shop name."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Shop profile</span>
              <span className="text-xs text-muted-foreground">
                {doneCount} of {steps.length} done
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Shop profile completeness"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={doneCount}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {steps.map((step) => (
                <li key={step.label} className="flex items-center gap-2.5">
                  <span
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
                      step.done ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {step.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                  </span>
                  <span className={step.done ? "text-foreground" : "text-muted-foreground"}>
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : " (not set)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </aside>

      <div className="flex min-w-0 flex-col gap-4 lg:order-1">
        <Card className="border-border">
          <CardContent className="flex flex-col gap-5 p-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Branding</h2>
              <p className="text-sm text-muted-foreground">Images save as soon as you choose them.</p>
            </div>
            <ShopImageUploader
              kind="banner"
              label="Banner"
              currentUrl={shop.bannerUrl}
              shopName={shop.name}
              onUrlChange={setBannerUrl}
            />
            <ShopImageUploader
              kind="logo"
              label="Logo"
              currentUrl={shop.logoUrl}
              shopName={shop.name}
              onUrlChange={setLogoUrl}
            />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">About your shop</h2>
              <p className="text-sm text-muted-foreground">Shown on your public shop page.</p>
            </div>
            <ShopBrandingForm shop={shop} onDescriptionChange={setDescription} />
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Shop details</h2>
              <p className="text-sm text-muted-foreground">Set by an administrator.</p>
            </div>
            <dl className="divide-y divide-border text-sm">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Shop name</dt>
                <dd className="text-right font-medium text-foreground">{shop.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Public link</dt>
                <dd className="min-w-0 break-all text-right font-medium text-foreground">{shop.slug}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge tone={shop.active ? "success" : "neutral"}>{shop.active ? "Active" : "Inactive"}</Badge>
                </dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              To change the name, link or status, contact an administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
