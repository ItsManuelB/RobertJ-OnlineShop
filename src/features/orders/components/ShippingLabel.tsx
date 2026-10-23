import { formatDateTime } from "@/lib/utils/date";
import { Barcode128 } from "@/features/orders/components/Barcode128";
import { QrCode } from "@/features/orders/components/QrCode";
import { formatAddressCityLine, type Order, type OrderShipment } from "@/features/orders/types/order.types";

export interface ShippingLabelProps {
  order: Order;
  shipment: OrderShipment | null;
  /** Ship-from shop name, or null when the seller has no resolvable shop. */
  shopName: string | null;
}

/**
 * The printable RobertJ shipping label — plain HTML, self-contained (no
 * external assets). Carries the order number as a QR code (best for phone
 * cameras) and a full-width Code 128 barcode (for handheld scanners), both
 * decoded by the seller's scanner. Built entirely from data
 * already on the order: the shipping-address snapshot, order number, item
 * lines, and the manually-captured courier + tracking. Rendered inside a
 * `data-print-root` wrapper so the print stylesheet isolates it from the
 * dashboard chrome.
 */
export function ShippingLabel({ order, shipment, shopName }: ShippingLabelProps) {
  const address = order.shippingAddress;
  const cityLine = address ? formatAddressCityLine(address) : "";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-lg border-2 border-black bg-white p-6 text-black">
      <div className="flex items-baseline justify-between border-b-2 border-black pb-3">
        <span className="font-serif text-2xl font-bold tracking-tight">RobertJ</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em]">
          Shipping Label
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">
              Order
            </p>
            <p className="text-2xl font-bold tracking-tight">{order.orderNumber}</p>
            <p className="text-xs text-gray-600">Placed {formatDateTime(order.placedAt)}</p>
          </div>
          {/* QR first: it reads from a phone even when the label is smudged, curved or slightly out of focus. */}
          <QrCode value={order.orderNumber} size={112} />
        </div>
        <div className="mt-3">
          <Barcode128 value={order.orderNumber} height={80} fullWidth showText={false} />
        </div>
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">
          Ship to
        </p>
        {address ? (
          <address className="mt-1 flex flex-col gap-0.5 text-sm not-italic">
            <span className="font-semibold">{address.fullName}</span>
            <span>{address.line1}</span>
            {address.line2 ? <span>{address.line2}</span> : null}
            {cityLine ? <span>{cityLine}</span> : null}
            <span>{[address.postalCode, address.country].filter(Boolean).join(", ")}</span>
            {address.phone ? <span className="text-xs">{address.phone}</span> : null}
          </address>
        ) : (
          <p className="mt-1 text-sm text-gray-600">No delivery address recorded.</p>
        )}
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">
          Ship from
        </p>
        <p className="mt-1 text-sm font-semibold">{shopName ?? "RobertJ Shop"}</p>
      </div>

      <div className="mt-4 border-t border-gray-300 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">
          Items
        </p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0">
                {item.productTitle}
                {item.variantLabel ? (
                  <span className="text-gray-600"> · {item.variantLabel}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-semibold">×{item.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 border-t-2 border-black pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">
          Courier &amp; tracking
        </p>
        {shipment?.courier || shipment?.trackingNumber ? (
          <div className="mt-1">
            <p className="text-sm font-semibold">{shipment.courier ?? "—"}</p>
            <p className="font-mono text-base font-bold tracking-wide">
              {shipment.trackingNumber ?? "—"}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-600">
            Not yet shipped — tracking will appear here once captured.
          </p>
        )}
      </div>
    </div>
  );
}
