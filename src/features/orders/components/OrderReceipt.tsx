import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { formatAddressCityLine, type Order } from "@/features/orders/types/order.types";

export interface OrderReceiptProps {
  order: Order;
  /** Resolved shop/seller display name, or null — mirrors ShippingLabel's own fallback. */
  shopName: string | null;
  /** `paymentMethodLabel(activePayment)` — "Cash on Delivery" / "Paid via GCash" / etc. */
  paymentLabel: string;
}

/**
 * The printable buyer receipt — plain HTML, self-contained, no PDF library.
 * Mirrors `ShippingLabel`'s visual language (same card shell, section
 * rhythm) so the two print surfaces read as one system, but shows the
 * buyer-relevant half of the order: items + prices + payment, not
 * courier/tracking. Available for any order status — it documents the
 * purchase itself, not just a delivered one. Rendered inside a
 * `data-print-root` wrapper so the shared print stylesheet isolates it from
 * the account-portal chrome.
 */
export function OrderReceipt({ order, shopName, paymentLabel }: OrderReceiptProps) {
  const address = order.shippingAddress;
  const cityLine = address ? formatAddressCityLine(address) : "";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-lg border-2 border-black bg-white p-6 text-black">
      <div className="flex items-baseline justify-between border-b-2 border-black pb-3">
        <span className="font-serif text-2xl font-bold tracking-tight">RobertJ</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Receipt</span>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Order</p>
        <p className="text-xl font-bold">{order.orderNumber}</p>
        <p className="text-xs text-gray-600">Placed {formatDateTime(order.placedAt)}</p>
        {order.deliveredAt ? (
          <p className="text-xs text-gray-600">Delivered {formatDateTime(order.deliveredAt)}</p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Sold by</p>
        <p className="mt-1 text-sm font-semibold">{shopName ?? "RobertJ Shop"}</p>
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Ship to</p>
        {address ? (
          <address className="mt-1 flex flex-col gap-0.5 text-sm not-italic">
            <span className="font-semibold">{address.fullName}</span>
            <span>{address.line1}</span>
            {address.line2 ? <span>{address.line2}</span> : null}
            {cityLine ? <span>{cityLine}</span> : null}
            <span>{[address.postalCode, address.country].filter(Boolean).join(", ")}</span>
          </address>
        ) : (
          <p className="mt-1 text-sm text-gray-600">No delivery address recorded.</p>
        )}
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Items</p>
        <ul className="mt-1 flex flex-col gap-1.5 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0">
                {item.productTitle}
                {item.variantLabel ? (
                  <span className="text-gray-600"> · {item.variantLabel}</span>
                ) : null}
                <span className="text-gray-600"> ×{item.quantity}</span>
              </span>
              <span className="shrink-0 font-semibold">
                {formatCurrency(item.subtotalCents, order.currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-600">Subtotal</dt>
            <dd className="font-medium">{formatCurrency(order.subtotalCents, order.currency)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-600">Shipping</dt>
            <dd className="font-medium">
              {order.shippingFeeCents === 0
                ? "Free"
                : formatCurrency(order.shippingFeeCents, order.currency)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 border-t-2 border-black pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Total</p>
          <p className="text-xl font-bold">{formatCurrency(order.totalCents, order.currency)}</p>
        </div>
        <p className="mt-1 text-xs text-gray-600">{paymentLabel}</p>
      </div>
    </div>
  );
}
