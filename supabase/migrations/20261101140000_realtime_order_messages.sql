-- =============================================================================
-- Real-time messages: stream order_messages inserts to the browser so the
-- global inbox updates live (Messenger-style), replacing manual refresh.
--
-- Additive + idempotent: adds the append-only order_messages table to the
-- built-in `supabase_realtime` publication. Delivery to each client is still
-- gated by order_messages' existing SELECT RLS (participant / shop member /
-- admin), so a user only receives inserts for conversations they can already
-- read. INSERT-only semantics need no REPLICA IDENTITY change.
--
-- Supersedes ADR-026's "no realtime" scope note (user-requested).
--
-- ROLLBACK:
--   alter publication supabase_realtime drop table public.order_messages;
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_messages'
  ) then
    alter publication supabase_realtime add table public.order_messages;
  end if;
end $$;
