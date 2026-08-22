-- ProofMode 2.0 growth engine: Drops, founder status, referrals, public snapshots.
-- Run after 001_init.sql.

alter table public.profiles add column if not exists bio text check (char_length(bio) <= 160);
alter table public.profiles add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_idx on public.profiles(referral_code) where referral_code is not null;

update public.profiles
set referral_code = lower(substr(md5(id::text || created_at::text), 1, 12))
where referral_code is null;

update public.profiles
set handle = 'member_' || lower(substr(md5(id::text), 1, 7))
where handle is null;

alter table public.challenges add column if not exists format text not null default 'crew' check (format in ('crew','drop'));
alter table public.challenges add column if not exists category text not null default 'other' check (category in ('fitness','build','work','creative','mind','social','other'));
alter table public.challenges add column if not exists tagline text check (char_length(tagline) <= 120);
alter table public.challenges add column if not exists launch_at timestamptz;
alter table public.challenges add column if not exists seat_cap int check (seat_cap is null or seat_cap between 2 and 100000);
alter table public.challenges add column if not exists founder_cutoff int not null default 5 check (founder_cutoff between 1 and 100);
alter table public.challenges add column if not exists cover_emoji text check (char_length(cover_emoji) <= 8);

alter table public.challenge_members add column if not exists founder boolean not null default false;
update public.challenge_members cm
set founder = true
where cm.role = 'owner';


-- Database-level entitlement hardening. The browser talks directly to Supabase, so API-only
-- checks are not sufficient: protect billing-owned plan state and force joins through the RPC.
revoke update on table public.profiles from authenticated;
grant update (handle, display_name, avatar_url, bio) on table public.profiles to authenticated;

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.challenge_configuration_allowed(target_visibility text, target_seat_cap int)
returns boolean language sql stable security definer set search_path = '' as $$
  select case coalesce((select p.plan from public.profiles p where p.id = auth.uid()), 'free')
    when 'creator' then target_seat_cap is null or target_seat_cap <= 100000
    when 'pro' then target_seat_cap is null or target_seat_cap <= 25
    else target_visibility <> 'private' and (target_seat_cap is null or target_seat_cap <= 5)
  end;
$$;

create or replace function public.challenge_create_allowed(target_visibility text, target_seat_cap int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_plan text;
  owned_count int;
begin
  if actor_id is null then return false; end if;

  -- Serialize challenge creation per account so two concurrent requests cannot both
  -- slip through the Free one-challenge quota.
  select p.plan into actor_plan from public.profiles p where p.id = actor_id for update;
  if actor_plan is null then return false; end if;
  if not public.challenge_configuration_allowed(target_visibility, target_seat_cap) then return false; end if;

  if actor_plan = 'free' then
    select count(*) into owned_count from public.challenges c where c.owner_id = actor_id;
    if owned_count >= 1 then return false; end if;
  end if;
  return true;
end;
$$;

revoke all on function public.challenge_configuration_allowed(text, int) from public;
revoke all on function public.challenge_create_allowed(text, int) from public;
grant execute on function public.challenge_configuration_allowed(text, int) to authenticated;
grant execute on function public.challenge_create_allowed(text, int) to authenticated;

drop policy if exists "challenge owner insert" on public.challenges;
create policy "challenge owner insert" on public.challenges for insert
with check (
  owner_id = auth.uid()
  and public.challenge_create_allowed(visibility, seat_cap)
);

drop policy if exists "challenge owner update" on public.challenges;
create policy "challenge owner update" on public.challenges for update
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and public.challenge_configuration_allowed(visibility, seat_cap)
);

-- Remove direct membership inserts. All joins now go through join_challenge_v2, which performs
-- invite, plan, seat-cap, founder, and referral checks atomically under a row lock below.
drop policy if exists "users can join visible challenges" on public.challenge_members;
revoke execute on function public.join_public_challenge(text) from authenticated;

create table if not exists public.invite_claims (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (challenge_id, referred_user_id),
  check (inviter_id <> referred_user_id)
);

alter table public.invite_claims enable row level security;
create policy "invite participants read claims" on public.invite_claims for select
using (auth.uid() = inviter_id or auth.uid() = referred_user_id or public.is_challenge_owner(challenge_id));

create index if not exists invite_claims_inviter_idx on public.invite_claims(inviter_id, claimed_at desc);
create index if not exists invite_claims_challenge_idx on public.invite_claims(challenge_id, claimed_at desc);
create index if not exists challenges_format_created_idx on public.challenges(format, created_at desc);

-- New users receive a stable share code and a handle suitable for public receipt passports.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base_handle text;
begin
  base_handle := lower(regexp_replace(split_part(coalesce(new.email, 'member'), '@', 1), '[^a-z0-9_]+', '', 'g'));
  if char_length(base_handle) < 2 then base_handle := 'member'; end if;
  insert into public.profiles (id, display_name, handle, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Member'),
    left(base_handle, 20) || '_' || substr(md5(new.id::text), 1, 5),
    lower(substr(md5(new.id::text || now()::text), 1, 12))
  );
  return new;
end; $$;

-- Replace the legacy join RPC with invite-aware joining. Invite links also unlock crew/private Drops.
create or replace function public.join_challenge_v2(target_slug text, target_invite_code text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  oid uuid;
  vis text;
  cap int;
  owner_plan text;
  member_limit int;
  current_count int;
  cutoff int;
  invite_row public.invites%rowtype;
  is_founder boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select c.id, c.owner_id, c.visibility, c.seat_cap, c.founder_cutoff
  into cid, oid, vis, cap, cutoff
  from public.challenges c
  where c.slug = target_slug
  for update;

  if cid is null then raise exception 'challenge not found'; end if;

  if target_invite_code is not null and target_invite_code <> '' then
    select * into invite_row from public.invites i
    where i.code = target_invite_code and i.challenge_id = cid
    limit 1;
  end if;

  if vis <> 'public' and invite_row.id is null and oid <> auth.uid() then
    raise exception 'invite required';
  end if;

  if exists (select 1 from public.challenge_members cm where cm.challenge_id = cid and cm.user_id = auth.uid()) then
    return cid;
  end if;

  select p.plan into owner_plan from public.profiles p where p.id = oid;
  member_limit := case when owner_plan = 'creator' then 100000 when owner_plan = 'pro' then 25 else 5 end;
  if cap is not null then member_limit := least(member_limit, cap); end if;

  select count(*) into current_count from public.challenge_members cm where cm.challenge_id = cid;
  if current_count >= member_limit then raise exception 'crew full'; end if;

  is_founder := current_count < cutoff;
  insert into public.challenge_members (challenge_id, user_id, role, founder)
  values (cid, auth.uid(), 'member', is_founder)
  on conflict do nothing;

  if invite_row.id is not null and invite_row.inviter_id <> auth.uid() then
    insert into public.invite_claims (invite_id, challenge_id, inviter_id, referred_user_id)
    values (invite_row.id, cid, invite_row.inviter_id, auth.uid())
    on conflict (challenge_id, referred_user_id) do nothing;
    if found then
      update public.invites set uses = uses + 1 where id = invite_row.id;
    end if;
  end if;

  return cid;
end; $$;

revoke all on function public.join_challenge_v2(text, text) from public;
grant execute on function public.join_challenge_v2(text, text) to authenticated;

-- Safe public stats for public challenge landing pages. It reveals counts and leaderboard identity only,
-- never private media URLs or private challenge membership.
create or replace function public.get_public_challenge_snapshot(target_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
with target as (
  select c.id from public.challenges c where c.slug = target_slug and c.visibility = 'public' limit 1
),
receipt_counts as (
  select p.user_id,
         count(*)::int as receipts,
         count(*) filter (where exists (
           select 1 from public.verifications v where v.proof_id = p.id and v.verdict = true
         ))::int as verified_receipts
  from public.proofs p
  join target t on t.id = p.challenge_id
  group by p.user_id
),
ranked as (
  select cm.user_id,
         coalesce(pr.display_name, 'Member') as display_name,
         pr.handle,
         cm.founder,
         coalesce(rc.receipts, 0)::int as receipts,
         coalesce(rc.verified_receipts, 0)::int as verified_receipts,
         (coalesce(rc.verified_receipts, 0) * 10 + coalesce(rc.receipts, 0) * 2)::int as proof_score,
         row_number() over (
           order by coalesce(rc.verified_receipts, 0) desc, coalesce(rc.receipts, 0) desc, cm.joined_at asc
         )::int as rank
  from public.challenge_members cm
  join target t on t.id = cm.challenge_id
  left join public.profiles pr on pr.id = cm.user_id
  left join receipt_counts rc on rc.user_id = cm.user_id
),
top_ranked as (
  select * from ranked order by rank asc limit 8
)
select case when exists (select 1 from target) then jsonb_build_object(
  'member_count', (select count(*)::int from ranked),
  'receipt_count', (select coalesce(sum(receipts),0)::int from ranked),
  'verified_receipt_count', (select coalesce(sum(verified_receipts),0)::int from ranked),
  'leaderboard', coalesce((select jsonb_agg(to_jsonb(top_ranked) order by rank) from top_ranked), '[]'::jsonb)
) else null end;
$$;

grant execute on function public.get_public_challenge_snapshot(text) to anon, authenticated;

-- Tighten invite creation: only members/owners can mint links for a challenge.
drop policy if exists "inviter manages invites" on public.invites;
create policy "members create invites" on public.invites for insert
with check (inviter_id = auth.uid() and (public.is_challenge_member(challenge_id) or public.is_challenge_owner(challenge_id)));
create policy "inviter reads invites" on public.invites for select using (inviter_id = auth.uid());
create policy "inviter deletes invites" on public.invites for delete using (inviter_id = auth.uid());

create or replace function public.get_profile_snapshot(target_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
with target as (
  select p.id from public.profiles p where p.handle = target_handle limit 1
),
public_receipts as (
  select pr.id
  from public.proofs pr
  join public.challenges c on c.id = pr.challenge_id and c.visibility = 'public'
  join target t on t.id = pr.user_id
),
verified as (
  select count(*)::int as n from public_receipts pr
  where exists (select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true)
),
founders as (
  select count(*)::int as n
  from public.challenge_members cm
  join public.challenges c on c.id = cm.challenge_id and c.visibility = 'public'
  join target t on t.id = cm.user_id
  where cm.founder = true
),
recruits as (
  select count(*)::int as n
  from public.invite_claims ic
  join public.challenges c on c.id = ic.challenge_id and c.visibility = 'public'
  join target t on t.id = ic.inviter_id
)
select case when exists (select 1 from target) then jsonb_build_object(
  'receipts', (select count(*)::int from public_receipts),
  'verified_receipts', (select n from verified),
  'founder_badges', (select n from founders),
  'recruits', (select n from recruits),
  'proof_score', ((select n from verified) * 10 + (select count(*)::int from public_receipts) * 2 + (select n from recruits) * 5)
) else null end;
$$;

grant execute on function public.get_profile_snapshot(text) to anon, authenticated;

-- Safe metadata for a private/crew invite landing page. The code is the capability;
-- no member list, proof data, owner email, or storage path is returned.
create or replace function public.get_challenge_landing(target_slug text, target_invite_code text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
select to_jsonb(x) from (
  select c.id, c.owner_id, c.title, c.slug, c.rule, c.duration_days, c.visibility,
         c.format, c.category, c.tagline, c.seat_cap, c.founder_cutoff, c.cover_emoji
  from public.challenges c
  where c.slug = target_slug
    and (
      c.visibility = 'public'
      or c.owner_id = auth.uid()
      or public.is_challenge_member(c.id)
      or exists (select 1 from public.invites i where i.challenge_id = c.id and i.code = target_invite_code)
    )
  limit 1
) x;
$$;

grant execute on function public.get_challenge_landing(text, text) to anon, authenticated;

-- Transactional Stripe subscription synchronization. The service-role-only RPC makes the
-- event claim, subscription upsert, effective-plan recomputation, and activation event one
-- database transaction. Concurrent webhook deliveries block on billing_events' primary key;
-- a failed transaction rolls the claim back so the next Stripe retry can safely process it.
create or replace function public.sync_stripe_subscription_event(
  stripe_event_id text,
  stripe_event_type text,
  target_subscription_id text,
  target_customer_id text,
  target_user_id uuid,
  target_status text,
  target_plan text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  claimed boolean;
  previous_plan text;
  effective_plan text;
begin
  if stripe_event_id is null or stripe_event_id = '' then raise exception 'event id required'; end if;
  if target_subscription_id is null or target_subscription_id = '' then raise exception 'subscription id required'; end if;
  if target_customer_id is null or target_customer_id = '' then raise exception 'customer id required'; end if;
  if target_user_id is not null and target_status in ('active', 'trialing') and target_plan not in ('pro', 'creator') then
    raise exception 'invalid active subscription plan';
  end if;

  insert into public.billing_events (event_id, event_type)
  values (stripe_event_id, coalesce(stripe_event_type, 'unknown'))
  on conflict (event_id) do nothing;
  claimed := found;
  if not claimed then return false; end if;

  insert into public.subscriptions (
    stripe_subscription_id, stripe_customer_id, user_id, status, plan, updated_at
  ) values (
    target_subscription_id, target_customer_id, target_user_id, target_status, target_plan, now()
  )
  on conflict (stripe_subscription_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    user_id = excluded.user_id,
    status = excluded.status,
    plan = excluded.plan,
    updated_at = excluded.updated_at;

  if target_user_id is not null then
    select p.plan into previous_plan from public.profiles p where p.id = target_user_id for update;

    select case
      when exists (
        select 1 from public.subscriptions s
        where s.user_id = target_user_id and s.status in ('active', 'trialing') and s.plan = 'creator'
      ) then 'creator'
      when exists (
        select 1 from public.subscriptions s
        where s.user_id = target_user_id and s.status in ('active', 'trialing') and s.plan = 'pro'
      ) then 'pro'
      else 'free'
    end into effective_plan;

    update public.profiles set plan = effective_plan where id = target_user_id;

    if effective_plan <> 'free' and effective_plan is distinct from previous_plan then
      insert into public.analytics_events (user_id, event_name, source, properties)
      values (
        target_user_id,
        'subscription_active',
        'stripe',
        jsonb_build_object('plan', effective_plan, 'event_type', stripe_event_type)
      );
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.sync_stripe_subscription_event(text, text, text, text, uuid, text, text) from public;
grant execute on function public.sync_stripe_subscription_event(text, text, text, text, uuid, text, text) to service_role;
