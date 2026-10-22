-- =============================================================================
-- Client ask: buyer and seller should see a date/time on every step of an
-- order's status, not just the currently-active one. `orders` already
-- stamps `placed_at`/`shipped_at`/`delivered_at`/`cancelled_at` (initial
-- schema + `track_order_status_timestamps`), but the two steps in between —
-- `confirmed` and `processing` — had no timestamp column at all, so the
-- status timeline could never show a time for them.
--
-- Additive only: two new nullable columns, and `track_order_status_timestamps`
-- extended with the same `coalesce(new.X, now())`-on-transition shape already
-- used for shipped_at/delivered_at/cancelled_at — same pattern, same trust
-- model, nothing stricter or looser introduced for these two specifically.
--
-- Known, accepted limitation: this cannot backfill history. An order that
-- was already past `confirmed`/`processing` before this migration runs will
-- have null confirmed_at/processing_at forever — there is no real timestamp
-- to recover, and fabricating one would be worse than showing nothing. The
-- UI must render those steps without a time when the column is null.
--
-- ROLLBACK:
--   alter table public.orders drop column confirmed_at, drop column processing_at;
--   -- then restore track_order_status_timestamps from 20260802000100_initial_schema.sql
-- =============================================================================

begin;

alter table public.orders
  add column if not exists confirmed_at  timestamptz,
  add column if not exists processing_at timestamptz;

create or replace function public.track_order_status_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  if new.order_status = 'confirmed' and old.order_status is distinct from 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;

  if new.order_status = 'processing' and old.order_status is distinct from 'processing' then
    new.processing_at := coalesce(new.processing_at, now());
  end if;

  if new.order_status = 'shipped' and old.order_status is distinct from 'shipped' then
    new.shipped_at := coalesce(new.shipped_at, now());
  end if;

  if new.order_status = 'delivered' and old.order_status is distinct from 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;

  if new.order_status = 'cancelled' and old.order_status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

commit;
