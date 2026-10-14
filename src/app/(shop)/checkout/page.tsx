import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import type { UserRole } from "@/constants/roles";
import type { CartItem } from "@/features/cart/types/cart.types";
import { EmptyState } from "@/components/feedback/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { CheckoutForm } from "@/features/checkout/components/CheckoutForm";
import { CHECKOUT_CONSTANTS } from "@/features/checkout/constants/checkout.constants";
import { buyNowParamsSchema, type ShippingAddressInput } from "@/features/checkout/schemas/checkout.schema";
import { addressToShippingInput } from "@/features/checkout/utils/addressMapping";
import { canPurchase } from "@/lib/auth/permissions";
import * as queries from "@/lib/supabase/queries";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Checkout" };

interface CheckoutPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const user = await queries.requireSessionUser();
  // Buyer-only transaction route — seller/admin are redirected to the public
  // storefront (they can browse, not purchase). Backstopped by create_order/RLS.
  if (!canPurchase(user.role as UserRole)) redirect(ROUTES.home);

  // "Buy now": check out one product only, resolved from live data. A bad or
  // stale link shows why instead of silently falling back to the cart.
  let buyNowItem: CartItem | undefined;
  if (params.buyNow !== undefined) {
    const parsed = buyNowParamsSchema.safeParse({
      buyNow: params.buyNow,
      variant: params.variant,
      qty: params.qty,
    });
    const resolved = parsed.success
      ? await queries
          .getBuyNowLine({
            productId: parsed.data.buyNow,
            variantId: parsed.data.variant,
            quantity: parsed.data.qty,
          })
          .catch(() => ({ success: false as const, error: "We couldn't load this item. Please try again." }))
      : { success: false as const, error: "This checkout link isn't valid." };
    if (!resolved.success) {
      return (
        <EmptyState
          title="We can't check this out"
          description={resolved.error}
          action={
            <Link href={ROUTES.products} className={cn(buttonVariants({ variant: "rj", size: "rjSm" }))}>
              Back to products
            </Link>
          }
        />
      );
    }
    buyNowItem = resolved.line;
  }

  // Prefill priority: default saved address -> last order's address ->
  // profile name/phone -> empty form. Each fetch degrades independently
  // (`.catch(() => ...)`) so one failing never blocks checkout.
  const [savedAddresses, lastOrders, profile, preferences] = await Promise.all([
    queries.listMyAddresses(user.id).catch(() => []),
    queries.listBuyerOrders(user.id, { page: 1, pageSize: 1 }).catch(() => null),
    queries.getMyProfile().catch(() => null),
    queries.getMyBuyerPreferences(user.id).catch(() => null),
  ]);

  const defaultAddress = savedAddresses.find((address) => address.isDefault) ?? null;
  const lastAddress = lastOrders?.items[0]?.shippingAddress ?? null;

  let initialAddress: ShippingAddressInput | undefined;
  let initialAddressSource: "saved" | "last-order" | "profile" | "empty";
  let initialSelectedAddressId: string | null = null;

  if (defaultAddress) {
    initialAddress = addressToShippingInput(defaultAddress);
    initialAddressSource = "saved";
    initialSelectedAddressId = defaultAddress.id;
  } else if (lastAddress) {
    initialAddress = {
      fullName: lastAddress.fullName,
      line1: lastAddress.line1,
      line2: lastAddress.line2 ?? "",
      barangay: lastAddress.barangay ?? "",
      city: lastAddress.city,
      province: lastAddress.province ?? "",
      region: lastAddress.region ?? "",
      postalCode: lastAddress.postalCode,
      country: CHECKOUT_CONSTANTS.shippingCountry,
      phone: lastAddress.phone ?? "",
    };
    initialAddressSource = "last-order";
  } else if (profile?.fullName || profile?.phone) {
    initialAddress = {
      fullName: profile.fullName ?? "",
      line1: "",
      line2: "",
      barangay: "",
      city: "",
      province: "",
      region: "",
      postalCode: "",
      country: CHECKOUT_CONSTANTS.shippingCountry,
      phone: profile.phone ?? "",
    };
    initialAddressSource = "profile";
  } else {
    initialAddressSource = "empty";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-rj-gray-100 pb-3">
        <h1 className="text-xl font-semibold text-rj-black">Checkout</h1>
      </div>
      <CheckoutForm
        savedAddresses={savedAddresses}
        initialAddress={initialAddress}
        initialAddressSource={initialAddressSource}
        initialSelectedAddressId={initialSelectedAddressId}
        initialMethod={preferences?.defaultPaymentMethod ?? undefined}
        buyNowItem={buyNowItem}
      />
    </div>
  );
}
