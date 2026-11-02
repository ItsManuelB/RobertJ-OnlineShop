import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { formatAddressCityLine, type Order } from "@/features/orders/types/order.types";

export interface OrderInvoiceProps {
  order: Order;
  /** Resolved shop/seller display name, or null — mirrors OrderReceipt's own fallback. */
  shopName: string | null;
  /** `paymentMethodLabel(activePayment)` — "Cash on Delivery" / "Paid via GCash" / etc. */
  paymentLabel: string;
  /** Human-readable payment status ("Paid" / "Pending" / "Refunded" / "Failed"). */
  paymentStatusLabel: string;
}

/**
 * The printable buyer **invoice** — a separate document from `OrderReceipt`
 * (which stays as-is). Plain self-contained HTML, no PDF library, same
 * `data-print-root` print-isolation convention as the receipt/label so the
 * three print surfaces read as one system. Shows the formal invoice framing
 * Shopee's "E-invoice" provides: invoice number, issue date, From/Bill-to
 * parties, and an itemized unit-price × quantity table.
 *
 * Historical accuracy: the **issue date is the order's `placedAt`**, never
 * "now" — re-opening an old order must reproduce the same invoice. The invoice
 * number is derived deterministically from the immutable `orderNumber`.
 *
 * NOT a BIR / tax invoice: no TIN, VAT breakdown, or official-receipt claim is
 * asserted — this is a commercial order invoice only.
 */
export function OrderInvoice({
  order,
  shopName,
  paymentLabel,
  paymentStatusLabel,
}: OrderInvoiceProps) {
  const address = order.shippingAddress;
  const cityLine = address ? formatAddressCityLine(address) : "";
  const invoiceNumber = `INV-${order.orderNumber}`;

  return (
    <div className="mx-auto w-full max-w-[640px] rounded-lg border-2 border-black bg-white p-6 text-black sm:p-8">
      {/* Masthead */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
        <div>
          <p className="font-serif text-2xl font-bold tracking-tight">RobertJ</p>
          <p className="mt-0.5 text-xs text-gray-600">Online Shop</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-600">Invoice</p>
          <p className="mt-1 text-lg font-bold">{invoiceNumber}</p>
          <p className="text-xs text-gray-600">Issued {formatDateTime(order.placedAt)}</p>
        </div>
      </div>

      {/* Parties */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">From</p>
          <p className="mt-1 text-sm font-semibold">{shopName ?? "RobertJ Shop"}</p>
          <p className="text-xs text-gray-600">RobertJ Online Shop</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Bill to</p>
          {address ? (
            <address className="mt-1 flex flex-col gap-0.5 text-sm not-italic">
              <span className="font-semibold">{address.fullName}</span>
              <span>{address.line1}</span>
              {address.line2 ? <span>{address.line2}</span> : null}
              {cityLine ? <span>{cityLine}</span> : null}
              <span>{[address.postalCode, address.country].filter(Boolean).join(", ")}</span>
              {address.phone ? <span className="text-gray-600">{address.phone}</span> : null}
            </address>
          ) : (
            <p className="mt-1 text-sm text-gray-600">No delivery address recorded.</p>
          )}
        </div>
      </div>

      {/* Order reference */}
      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-gray-300 pt-4 text-xs">
        <div>
          <p className="font-bold uppercase tracking-[0.2em] text-gray-600">Order no.</p>
          <p className="mt-0.5 text-sm font-semibold">{order.orderNumber}</p>
        </div>
        <div className="text-right">
          <p className="font-bold uppercase tracking-[0.2em] text-gray-600">Order date</p>
          <p className="mt-0.5 text-sm">{formatDateTime(order.placedAt)}</p>
        </div>
      </div>

      {/* Itemized table */}
      <div className="mt-5 overflow-x-auto border-t border-gray-300 pt-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-[10px] uppercase tracking-[0.15em] text-gray-600">
              <th className="py-1.5 pr-2 font-bold">Item</th>
              <th className="py-1.5 px-2 text-center font-bold">Qty</th>
              <th className="py-1.5 px-2 text-right font-bold">Unit price</th>
              <th className="py-1.5 pl-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-200 align-top">
                <td className="py-2 pr-2">
                  <span className="font-medium">{item.productTitle}</span>
                  {item.variantLabel ? (
                    <span className="block text-xs text-gray-600">{item.variantLabel}</span>
                  ) : null}
                </td>
                <td className="py-2 px-2 text-center tabular-nums">{item.quantity}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {formatCurrency(item.unitPriceCents, order.currency)}
                </td>
                <td className="py-2 pl-2 text-right font-medium tabular-nums">
                  {formatCurrency(item.subtotalCents, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <dl className="w-full max-w-[260px] text-sm">
          <div className="flex items-center justify-between gap-2 py-1">
            <dt className="text-gray-600">Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(order.subtotalCents, order.currency)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 py-1">
            <dt className="text-gray-600">Shipping</dt>
            <dd className="tabular-nums">
              {order.shippingFeeCents === 0
                ? "Free"
                : formatCurrency(order.shippingFeeCents, order.currency)}
            </dd>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 border-t-2 border-black pt-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Total</dt>
            <dd className="text-xl font-bold tabular-nums">
              {formatCurrency(order.totalCents, order.currency)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Payment */}
      <div className="mt-5 border-t border-gray-300 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Payment</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">{paymentLabel}</span>
          <span className="text-gray-600"> · {paymentStatusLabel}</span>
        </p>
      </div>

      <p className="mt-6 border-t border-gray-200 pt-3 text-center text-[10px] leading-relaxed text-gray-500">
        This is a commercial order invoice generated by RobertJ Online Shop. It is not an official
        BIR receipt or tax invoice. Thank you for shopping with us.
      </p>
    </div>
  );
}
