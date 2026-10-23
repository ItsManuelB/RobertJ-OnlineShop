# Cancellation and automatic refunds

How an order cancellation turns into a refund, what was verified, and what still needs a human.

## Rules

| Order status when the buyer acts | What the buyer can do | What happens |
|---|---|---|
| `pending`, `confirmed` | **Cancel order** | Cancelled at once. Stock is restored. Unpaid: nothing to refund. Paid: a full refund is opened automatically. |
| `processing` (Ready for Pickup) | **Request cancellation** | The shop approves (same as above) or declines with a reason; the order then stays active. |
| `shipped`, `delivered` | Existing return / refund flow | Unchanged. A seller cancelling a shipped order (failed delivery) is **not** auto-refunded. |

Cancellation status and refund status are separate. The order stays `cancelled`; the refund has its own state: **processing → completed**, or **needs attention** (retryable).

## How a refund is opened and sent

1. The cancel (any path) updates `orders.order_status` to `cancelled`. The trigger `orders_open_refund_on_cancel` opens the refund in the same transaction: a system `return_requests` row (`reason_code = order_cancelled`, `status = seller_accepted`) and a `pending` `xendit_refunds` attempt for the amount actually paid. COD or a payment with no Xendit reference becomes `refund_due` (staff pays the buyer and records it, as for any COD refund).
2. The server action sends the attempt to Xendit (`POST /refunds`, `reason = CANCELLATION`, `Idempotency-Key = attempt id`) and then asks Xendit for the real status. Only Xendit's webhook / status sync marks it succeeded.
3. If our call to Xendit fails, the attempt is marked `failed` (`submission_error`). The 15-minute sweep re-opens up to 4 attempts automatically; after that, or if Xendit itself rejected the refund, the seller/admin sees **Retry refund**.
4. A payment that succeeds after its order was cancelled is recorded and refunded in full by the webhook (and, as a backstop, by reconciliation).

No double refunds: one open cancellation refund per order, a new attempt is refused while one is pending or already succeeded, and the same attempt id is always the Idempotency-Key.

## Refund support and timing (Xendit)

- GCash, Maya and card payments are refunded through `POST /refunds` against the payment request. Refund windows from Xendit's API reference: 180 days (GCash), 365 days (Maya).
- Timing shown to the buyer: e-wallets usually within 1 business day after processing; cards usually 7-14 business days, controlled by the bank. This comes from Xendit's help centre ("How long does it take to process a refund?"); Xendit does not give a guaranteed end-to-end time, so the wording is an estimate.

## What was verified

- `supabase/tests/order_cancellation_refunds.test.sql` — 26 scenarios, run on the live database inside a rolled-back transaction (all passed).
- `node --test scripts/test-cancellation-refund.mjs` (part of `npm run test:unit`).
- `node scripts/e2e-cancellation-refund.mjs` — Xendit test mode: the refund request is accepted with reason `CANCELLATION`, a never-captured payment is rejected (`INELIGIBLE_TRANSACTION`), repeating the same Idempotency-Key gives the same answer, and the failure/retry/4-attempt limit behave. It removes its records afterwards.

Not automatable: a **successful** e-wallet refund, because Xendit's simulate-payment API only supports VA/OTC/QR.

## Manual end-to-end check (test mode, no real money)

1. Keep `XENDIT_SECRET_KEY` as the `xnd_development_…` key.
2. As a buyer, place a small order and pay with GCash (or Maya/card) on Xendit's test page, completing the test payment.
3. While the order is *To Pack* or *Confirmed*, press **Cancel order**. Expect "Order cancelled. Your ₱X refund is processing. No further action is needed." and a *Refund* card on the order page.
4. Within about a minute (or on the next 15-minute sweep) the card should read **Completed** once Xendit's `refund.succeeded` arrives. Check the Reports page: *Refunds pending* returns to ₱0.00 and net revenue drops by the refund.
5. Repeat once with a seller-side "Ready for Pickup" order: press **Request cancellation**, then approve or decline it from the seller's order page.

## Known limits

- Refund wording for cards is an estimate (the bank decides).
- Email is not wired in this project; buyers are told through the order page and the activity feed.
- Cancelling a multi-shop card payment refunds each cancelled order's own amount separately.
