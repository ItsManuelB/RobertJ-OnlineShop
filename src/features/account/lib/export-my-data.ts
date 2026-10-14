/**
 * Builds the buyer's "Download my data" file. Pure on purpose (no framework or
 * Supabase imports) so what leaves the system is unit-testable
 * (scripts/test-export-my-data.mjs).
 *
 * It is an explicit allow-list, not a spread of the source objects: internal
 * ids (user / seller / buyer ids), payment-proof storage paths and anything
 * added to those types later never reach the file unless listed here. Money is
 * reported in integer cents plus the order's currency, matching the app.
 */

export interface ExportProfile {
  fullName: string | null;
  username: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  bio: string | null;
}

export interface ExportAddress {
  label: string;
  recipientName: string;
  phone: string;
  region: string | null;
  province: string | null;
  city: string;
  barangay: string | null;
  streetDetails: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportOrderItem {
  productTitle: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface ExportOrder {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotalCents: number;
  shippingFeeCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: {
    fullName: string;
    line1: string;
    line2: string | null;
    barangay: string | null;
    city: string;
    province: string | null;
    region: string | null;
    postalCode: string;
    country: string;
    phone: string | null;
  } | null;
  notes: string | null;
  shopName: string | null;
  items: ExportOrderItem[];
  placedAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

export interface ExportPreferences {
  orderUpdates: boolean;
  promotions: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  defaultPaymentMethod: string | null;
}

export interface ExportSource {
  email: string | null;
  profile: ExportProfile | null;
  preferences: ExportPreferences;
  addresses: ExportAddress[];
  orders: ExportOrder[];
  wishlistCount: number;
}

export const EXPORT_FORMAT_VERSION = 1;

export function buildExport(source: ExportSource, now: Date = new Date()) {
  const { profile, preferences } = source;
  return {
    exportedAt: now.toISOString(),
    formatVersion: EXPORT_FORMAT_VERSION,
    account: {
      email: source.email,
      fullName: profile?.fullName ?? null,
      username: profile?.username ?? null,
      phone: profile?.phone ?? null,
      gender: profile?.gender ?? null,
      dateOfBirth: profile?.dateOfBirth ?? null,
      bio: profile?.bio ?? null,
    },
    preferences: {
      orderUpdates: preferences.orderUpdates,
      promotions: preferences.promotions,
      pushEnabled: preferences.pushEnabled,
      emailEnabled: preferences.emailEnabled,
      smsEnabled: preferences.smsEnabled,
      defaultPaymentMethod: preferences.defaultPaymentMethod,
    },
    addresses: source.addresses.map((a) => ({
      label: a.label,
      recipientName: a.recipientName,
      phone: a.phone,
      region: a.region,
      province: a.province,
      city: a.city,
      barangay: a.barangay,
      streetDetails: a.streetDetails,
      postalCode: a.postalCode,
      country: a.country,
      isDefault: a.isDefault,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    orders: source.orders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      subtotalCents: o.subtotalCents,
      shippingFeeCents: o.shippingFeeCents,
      totalCents: o.totalCents,
      currency: o.currency,
      shippingAddress: o.shippingAddress
        ? {
            fullName: o.shippingAddress.fullName,
            line1: o.shippingAddress.line1,
            line2: o.shippingAddress.line2,
            barangay: o.shippingAddress.barangay,
            city: o.shippingAddress.city,
            province: o.shippingAddress.province,
            region: o.shippingAddress.region,
            postalCode: o.shippingAddress.postalCode,
            country: o.shippingAddress.country,
            phone: o.shippingAddress.phone,
          }
        : null,
      notes: o.notes,
      shopName: o.shopName,
      items: o.items.map((i) => ({
        productTitle: i.productTitle,
        variantLabel: i.variantLabel,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        subtotalCents: i.subtotalCents,
      })),
      placedAt: o.placedAt,
      paidAt: o.paidAt,
      shippedAt: o.shippedAt,
      deliveredAt: o.deliveredAt,
      cancelledAt: o.cancelledAt,
    })),
    wishlistCount: source.wishlistCount,
  };
}

export type MyDataExport = ReturnType<typeof buildExport>;

/** `robertj-my-data-YYYY-MM-DD.json` — date from the export's own timestamp. */
export function exportFileName(exportedAt: string): string {
  return `robertj-my-data-${exportedAt.slice(0, 10)}.json`;
}
