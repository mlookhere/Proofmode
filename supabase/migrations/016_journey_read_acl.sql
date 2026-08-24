-- Allow authenticated clients to read Journey rows through the block-aware RLS policy.
-- Journey mutations remain RPC-owned.

grant select on table public.journeys to authenticated;
