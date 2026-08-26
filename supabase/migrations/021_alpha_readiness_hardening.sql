-- Cross-project alpha hardening: deterministic client grants, stale-policy cleanup,
-- and durable RevenueCat refresh abuse control. Keep this migration forward-only.

-- Supabase Data API clients never need ownership-like table privileges. Remove them
-- from every existing public table and from future tables created by this owner.
revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from public, anon, authenticated;

-- Older migrations predate deterministic Data API grants. Replace their inherited
-- grants with only the operations used by current web/mobile code.
revoke all on table public.analytics_events from anon, authenticated;
grant insert on table public.analytics_events to anon, authenticated;

revoke all on table public.challenge_members from anon, authenticated;
grant select on table public.challenge_members to authenticated;

revoke all on table public.challenge_templates from anon, authenticated;
grant select on table public.challenge_templates to anon, authenticated;

revoke all on table public.challenges from anon, authenticated;
grant select on table public.challenges to anon, authenticated;
grant insert, update on table public.challenges to authenticated;

revoke all on table public.invite_claims from anon, authenticated;
grant select on table public.invite_claims to authenticated;

revoke all on table public.invites from anon, authenticated;
grant select on table public.invites to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;

revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;

revoke all on table public.user_interests from anon, authenticated;
grant select, insert, delete on table public.user_interests to authenticated;

revoke all on table public.watched_challenges from anon, authenticated;
grant select, insert, delete on table public.watched_challenges to authenticated;

-- Social/Journey credibility mutations were moved behind narrow RPCs in migrations
-- 013, 015 and 016. Remove their obsolete mutation policies so the database contract
-- matches the actual client boundary instead of relying only on revoked table grants.
drop policy if exists "users comment" on public.comments;
drop policy if exists "users delete own comments" on public.comments;
drop policy if exists "users update own live comments" on public.comments;

drop policy if exists "crew members create room messages" on public.crew_messages;
drop policy if exists "users delete own room messages" on public.crew_messages;

drop policy if exists "users follow" on public.follows;
drop policy if exists "users unfollow" on public.follows;

drop policy if exists "members create invites" on public.invites;
drop policy if exists "inviter deletes invites" on public.invites;

drop policy if exists "users create own journeys" on public.journeys;
drop policy if exists "users update own journeys" on public.journeys;

drop policy if exists "users react" on public.post_reactions;
drop policy if exists "users change own reaction" on public.post_reactions;
drop policy if exists "users remove own reaction" on public.post_reactions;

drop policy if exists "users insert own proofs" on public.proofs;
drop policy if exists "users submit reports" on public.reports;

drop policy if exists "members verify proofs" on public.verifications;
drop policy if exists "members update own verification" on public.verifications;

drop policy if exists "profiles self update" on public.profiles;

-- Blocking is also RPC-owned, but preserve the useful caller-only read shape without
-- retaining an ALL policy that falsely suggests direct client mutation is supported.
drop policy if exists "blocker manages blocks" on public.blocks;
create policy "blocker reads own blocks"
on public.blocks for select
to authenticated
using (blocker_id = (select auth.uid()));

-- Durable per-user RevenueCat refresh lease. Reuse billing_events rather than adding
-- another rate-limit store. One fixed row per user bounds growth and atomically gates
-- outbound RevenueCat traffic before the provider request is made.
create or replace function private.claim_revenuecat_refresh_v1(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  refresh_key text;
  last_attempt timestamptz;
  current_attempt timestamptz := pg_catalog.clock_timestamp();
  retry_seconds integer;
begin
  if target_user_id is null then raise exception 'user id required'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'profile not found';
  end if;

  refresh_key := 'refresh-window:' || target_user_id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(refresh_key, 0));

  select b.processed_at into last_attempt
  from public.billing_events b
  where b.event_id = refresh_key
  for update;

  if last_attempt is not null and last_attempt > current_attempt - pg_catalog.make_interval(secs => 60) then
    retry_seconds := pg_catalog.ceil(
      pg_catalog.date_part('epoch', last_attempt + pg_catalog.make_interval(secs => 60) - current_attempt)
    )::integer;
    return greatest(1, retry_seconds);
  end if;

  insert into public.billing_events (event_id, event_type, processed_at)
  values (refresh_key, 'revenuecat:refresh_claim', current_attempt)
  on conflict (event_id) do update set
    event_type = excluded.event_type,
    processed_at = excluded.processed_at;

  return 0;
end;
$$;
revoke all on function private.claim_revenuecat_refresh_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function private.claim_revenuecat_refresh_v1(uuid) to service_role;

create or replace function public.claim_revenuecat_refresh_v1(target_user_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.claim_revenuecat_refresh_v1(target_user_id);
$$;
revoke all on function public.claim_revenuecat_refresh_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_revenuecat_refresh_v1(uuid) to service_role;
