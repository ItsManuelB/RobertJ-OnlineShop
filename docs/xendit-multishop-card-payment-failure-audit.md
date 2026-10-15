# Xendit Multi-Shop (Group) Payment Failure — Root Cause Audit

**Status:** Audit only. No code, migration, or DB data was modified. All evidence pulled live from the
Supabase project (`hjxtbnmnwlbqgptgncoh`) and Vercel (`roberj-onlineshop`, team `manuel00216s-projects`).

**Trigger:** buyer report that paying with **Card** across a multi-seller cart ("buy items from
different shops") intermittently fails.

---

## Summary

There are **two independent, confirmed root causes**, both specific to the **group** (multi-seller)
Xendit payment path — the single-seller path does not have either bug. A third issue is a recurring
data-consistency gap that compounds both.

| # | Root cause | Severity | Confidence |
|---|---|---|---|
| 1 | Cross-channel webhook deadlock: one abandoned channel's leftover `pending` row permanently blocks webhook processing for the **entire group**, including a channel (e.g. Card) that goes on to succeed | High — silent, permanent, no buyer-visible error | Confirmed live, root cause fully read from the RPC source |
| 2 | Card session creation for a group can fail repeatedly with zero forensic trail once Vercel's log window rolls over | High — buyer-visible ("payment fails"), but exact trigger unconfirmed | Confirmed live (4 consecutive failed attempts), external cause unconfirmed |
| 3 | Cancelling one order out of a still-pending group leaves that order's `payment_status`/`payment_method` stuck at `pending`/`xendit` forever | Medium — orphaned record, not a billing-safety issue | Confirmed live, recurring (2nd known instance) |

---

## 1. Root cause: cross-channel webhook deadlock (group checkouts only)

**`process_xendit_webhook`'s group branch** has an "all pending rows must agree" consistency guard,
meant to stop a stale/mismatched webhook from being misapplied:

```sql
if exists (
  select 1 from public.payments
  where checkout_group_id = p_reference_id
    and status = 'pending'
    and payment_channel <> 'CARD'
    and xendit_payment_request_id is distinct from p_xendit_payment_request_id
) then
  -- logs 'reference_mismatch', returns without ever reaching the apply logic below
```

This checks **every still-pending row in the group, on every channel** — not just the channel the
incoming webhook is actually for. Meanwhile, `begin_xendit_group_payment_attempt`'s "supersede the old
attempt" logic is **channel-scoped**:

```sql
update public.payments
set status = 'failed', failure_reason = 'superseded_by_new_attempt'
where checkout_group_id = p_checkout_group_id
  and payment_channel = p_channel_code   -- only the channel being retried
  and status = 'pending' and xendit_payment_request_id is null
```

So: if a buyer starts payment on channel A (e.g. Maya), abandons it, and pays on channel B instead
(e.g. GCash, or Card) — which the app explicitly supports via "Change Payment Method" — channel A's
`pending` row is **never cleaned up**. The next webhook for channel B then trips the guard above
(channel A's row has a different/null `xendit_payment_request_id`), and the **whole group** is logged
`reference_mismatch` and never applied — even though channel B's own rows would have matched fine.

This is channel-agnostic: it affects GCash, Maya, **and Card** group webhooks identically, because the
guard excludes only `payment_channel <> 'CARD'` *as the stale row*, not as the incoming channel.

**Live evidence:** `checkout_group_id = 4982c4b1-485c-413c-9ef4-eea42b234852` (2 orders, placed
2026-09-19). The buyer apparently started with PAYMAYA (reserved, never reached Xendit —
`xendit_payment_request_id` still `null`), then paid via GCASH (`pr-be1b2444-c7c4-4ef7-b9bf-f5b55d63a67c`).
Xendit has retried this webhook **once a day for 27 straight days** (2026-09-19 → 2026-10-15, 30
rows), every single one logged `reference_mismatch` with `status: SUCCEEDED` — i.e. Xendit considers
this paid, and our database has never recorded it. Both orders still show `payment_status = 'pending'`.

**Why this explains the Card symptom specifically:** any group checkout where the buyer so much as
*tries* a different channel before settling on Card reproduces this — identically to the GCash/Maya
case above, just with Card as the channel that never gets applied.

---

## 2. Root cause: Card session creation failures are unrecoverable forensically

`createXenditGroupCardSessionAction`/`createXenditCardSessionAction` wrap the Xendit `/sessions` API
call in a bare `catch { return fail(error.message) }`. If the call fails, the `payments` row is left
with `xendit_payment_request_id = null`. The buyer sees a generic error and can retry; the retry
supersedes the dead row (`begin_xendit_group_payment_attempt`'s 2-minute null-PR freshness window) and
tries again — a loop with no record kept of *why* each attempt died.

**Live evidence:** `checkout_group_id = ff81a380-443c-49ef-86c6-b33fc430c515` (2026-10-14, 2 days old,
2 orders, Card channel). Four consecutive attempts over ~1 hour (18:38, 18:44, 18:48, 19:32), **every
one superseded before ever acquiring a `xendit_payment_request_id`** — meaning the Xendit API call
failed four times in a row for this specific group. Vercel's Hobby-plan log retention (1 hour) had
already expired by the time this audit ran, so the actual error Xendit (or our own code) returned is
gone. Compare: three earlier Card groups (`48f4939b`, `b51580ca`, `f455e577`, `5e621f77`,
`dcb3ebc9` — all 2026-09-22 to 09-25) succeeded the same code path without issue, and no payments/
Xendit code has changed since 2026-09-25 (confirmed via `git log`), so this is not a code regression —
it's an unconfirmed, possibly external, failure that we currently have no way to diagnose after the
fact.

**Compounding factor:** even if this group's Card session had eventually succeeded, the stale
superseded rows (`payment_channel = 'CARD'`, `xendit_payment_request_id = null`, `status = 'failed'`)
don't trigger root cause #1's guard (they're `'failed'`, not `'pending'`) — but a *second*, different
channel abandoned mid-way would.

---

## 3. Root cause: cancelling one order mid-group orphans its payment fields

One of `ff81a380`'s two orders (`44c603ee`, `ORD-20261014-000404`) is `order_status = 'cancelled'` while
`payment_status` is still `'pending'` and `payment_method` still `'xendit'`. `enforce_order_update_rules`
correctly *blocks* cancellation while a fresh payment attempt is in flight — but there's a brief window
between a superseded attempt and the next retry where no row is "fresh," and cancellation slips through
legally. Nothing afterward ever resolves that order's `payment_status` — the webhook's
`order_cancelled` branch only fires if a webhook for that row's attempt ever arrives, which (per root
cause #2) it may never do.

This reproduces the exact shape of `ORD-20260914-000132`, already investigated in
`docs/xendit-payment-recovery-plan.md` and treated there as a one-off historical artifact. It isn't —
it's a structural gap: **nothing sweeps cancelled-but-still-`payment_status='pending'` orders**. Already
flagged as open technical debt (TD-9, `payment-ux-architecture-audit.md` §8 — "no automatic
expiry/cancellation of abandoned unpaid orders") but not yet scoped to cover this specific shape.

---

## Proposed implementation plan

Ordered by leverage; each phase is independently shippable and testable without the others.

### Phase 1 — Fix the webhook deadlock (root cause #1)

1. **Scope `process_xendit_webhook`'s group consistency guard to the incoming channel**, not the whole
   group: add `and payment_channel = coalesce(p_channel_code, payment_channel)` (or equivalent) to the
   "all pending rows must match" check, mirroring how the success-path member loop further down the
   same function already scopes by channel. Same fix needed for the `v_group_total`/`v_all_final`
   aggregates just below it, which currently sum across all channels' pending rows too.
2. **Make `begin_xendit_group_payment_attempt` supersede *other* channels' stale pending rows**, not
   just the one being retried — when a buyer starts channel B, channel A's abandoned pending rows for
   the same eligible orders should flip to `failed`/`superseded_by_channel_switch`. This stops new
   contamination at the source; step 1 is the defense-in-depth fix for contamination that already
   exists or still slips through.
3. **One-time remediation** of the live-stuck group `4982c4b1-...`: once the RPC is fixed, let the
   nightly cron (or a manual reconciliation call) re-apply the next retried webhook, or directly query
   Xendit's payment-request status and apply it through the fixed RPC.

### Phase 2 — Make outbound Xendit-call failures diagnosable (root cause #2)

4. Add a durable, forensic record for **outbound** Xendit API failures (mirroring the existing
   `payment_webhook_events`/`log_unrecognized_xendit_webhook_payload` pattern for **inbound** ones) —
   written from the `catch` blocks in all four `createXendit*Action`s in `xendit.actions.ts`, capturing
   order/group id, channel, attempt id, and the raw error.
5. Once live, the next occurrence of a group Card-session failure is diagnosable without racing
   Vercel's 1-hour log retention. Don't guess at the external cause now — capture first, patch once a
   real error is observed.
6. Surface a "this keeps failing, contact support" state in `XenditCardPaymentButton` after N
   consecutive attempt failures for the same order/group, instead of silently allowing an unbounded
   retry loop.

### Phase 3 — Reconcile cancelled-mid-flight orders (root cause #3)

7. Extend the existing nightly reconciliation cron
   (`src/app/api/cron/xendit-reconciliation/route.ts`) to also sweep orders where
   `order_status = 'cancelled' and payment_status = 'pending' and payment_method = 'xendit'`, resolving
   `payment_status` to `'failed'` (a cancelled order can never legitimately become paid).
8. Backfill the two known live orphans (`ORD-20260914-000132`, `ORD-20261014-000404`) through that same
   new code path once it ships, rather than an ad hoc `UPDATE`.

### Phase 4 — Verification

- Additive, idempotent migrations; regenerate `database.types.ts` after.
- Simulated via rolled-back DO-block tests (per this repo's established no-browser-tool methodology):
  group checkout with channel A abandoned then channel B paid → webhook applies cleanly; forced Card
  session failure → failure is persisted; cancel one order mid-group → nightly sweep resolves it.
- `npm run lint && npm run typecheck && npm run build`, plus an exercised live flow once deployed.

---

## Open questions before implementation

1. Phase 1 changes a `SECURITY DEFINER` payment RPC — a business-critical, hard-to-reverse surface.
   Confirm before I touch it.
2. Phase 3's auto-resolution of `payment_status` on cancelled orders is a small business-rule call
   (should it be `'failed'`, or something else?) — flagging per CLAUDE.md rather than assuming.
3. Scope: implement all three phases, or start with Phase 1 only (the one directly causing the
   reported Card failures) and treat 2–3 as follow-ups?
