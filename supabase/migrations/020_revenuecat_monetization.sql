-- Stage 12 monetization: RevenueCat entitlement cache with legacy Stripe compatibility.
-- profiles.plan remains the single server-owned effective plan cache.

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'pro', 'creator', 'black'));

-- Generalize the existing subscription ledger so RevenueCat and legacy Stripe can coexist.
alter table public.subscriptions add column if not exists id uuid default gen_random_uuid();
update public.subscriptions set id = gen_random_uuid() where id is null;
alter table public.subscriptions alter column id set not null;
alter table public.subscriptions drop constraint if exists subscriptions_pkey;
alter table public.subscriptions add primary key (id);
alter table public.subscriptions alter column stripe_subscription_id drop not null;
alter table public.subscriptions alter column stripe_customer_id drop not null;
alter table public.subscriptions
  add column if not exists provider text,
  add column if not exists provider_subscription_id text,
  add column if not exists entitlement text,
  add column if not exists product_id text,
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists provider_event_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists will_renew boolean,
  add column if not exists management_url text;

update public.subscriptions
set provider = 'stripe',
    provider_subscription_id = stripe_subscription_id
where provider is null;

alter table public.subscriptions alter column provider set not null;
alter table public.subscriptions alter column provider_subscription_id set not null;
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe', 'revenuecat'));
alter table public.subscriptions drop constraint if exists subscriptions_entitlement_check;
alter table public.subscriptions
  add constraint subscriptions_entitlement_check check (entitlement is null or entitlement in ('proof_plus', 'creator'));
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan is null or plan in ('pro', 'creator'));
alter table public.subscriptions drop constraint if exists subscriptions_provider_shape_check;
alter table public.subscriptions
  add constraint subscriptions_provider_shape_check check (
    (provider = 'stripe' and stripe_subscription_id is not null and stripe_customer_id is not null and entitlement is null)
    or
    (provider = 'revenuecat' and stripe_subscription_id is null and stripe_customer_id is null and entitlement in ('proof_plus', 'creator'))
  );

create unique index if not exists subscriptions_stripe_subscription_unique_idx
  on public.subscriptions(stripe_subscription_id);
create unique index if not exists subscriptions_provider_identifier_idx
  on public.subscriptions(provider, provider_subscription_id);
create index if not exists subscriptions_user_provider_status_idx
  on public.subscriptions(user_id, provider, status, updated_at desc);

revoke insert, update, delete on table public.subscriptions from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;

create or replace function private.recompute_effective_plan_v1(target_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan text;
  effective_plan text;
begin
  select p.plan into current_plan
  from public.profiles p
  where p.id = target_user
  for update;
  if current_plan is null then raise exception 'profile not found'; end if;

  -- Black is an explicit server-owned grant. Provider events can never create or remove it.
  if current_plan = 'black' then return 'black'; end if;

  select case
    when exists (
      select 1 from public.subscriptions s
      where s.user_id = target_user
        and s.status in ('active', 'trialing')
        and s.plan = 'creator'
        and (s.expires_at is null or s.expires_at > now())
    ) then 'creator'
    when exists (
      select 1 from public.subscriptions s
      where s.user_id = target_user
        and s.status in ('active', 'trialing')
        and s.plan = 'pro'
        and (s.expires_at is null or s.expires_at > now())
    ) then 'pro'
    else 'free'
  end into effective_plan;

  update public.profiles p set plan = effective_plan where p.id = target_user;
  return effective_plan;
end;
$$;
revoke all on function private.recompute_effective_plan_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function private.recompute_effective_plan_v1(uuid) to service_role;

create or replace function private.sync_revenuecat_entitlements_v1(
  revenuecat_event_id text,
  revenuecat_event_type text,
  target_user_id uuid,
  target_event_at timestamptz,
  active_entitlements text[],
  target_management_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_key text := 'revenuecat:' || btrim(coalesce(revenuecat_event_id, ''));
  event_type text := upper(btrim(coalesce(revenuecat_event_type, 'UNKNOWN')));
  clean_entitlements text[] := coalesce(active_entitlements, array[]::text[]);
  latest_event_at timestamptz;
  analytics_name text;
  entitlement_name text;
  entitlement_plan text;
begin
  if event_key = 'revenuecat:' then raise exception 'event id required'; end if;
  if target_user_id is null then raise exception 'user id required'; end if;
  if target_event_at is null then raise exception 'event time required'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then raise exception 'profile not found'; end if;
  if exists (
    select 1 from unnest(clean_entitlements) e
    where e not in ('proof_plus', 'creator')
  ) then raise exception 'invalid RevenueCat entitlement'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing:' || target_user_id::text, 0));

  insert into public.billing_events (event_id, event_type)
  values (event_key, 'revenuecat:' || event_type)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  select max(s.provider_event_at) into latest_event_at
  from public.subscriptions s
  where s.user_id = target_user_id and s.provider = 'revenuecat';

  -- The webhook handler refreshes current CustomerInfo before calling this RPC. A delayed
  -- older delivery therefore cannot overwrite a newer validated snapshot.
  if latest_event_at is not null and target_event_at < latest_event_at then return true; end if;

  foreach entitlement_name in array array['proof_plus', 'creator']::text[] loop
    entitlement_plan := case when entitlement_name = 'creator' then 'creator' else 'pro' end;
    insert into public.subscriptions (
      user_id, status, plan, provider, provider_subscription_id, entitlement,
      provider_event_at, management_url, updated_at
    ) values (
      target_user_id,
      case when entitlement_name = any(clean_entitlements) then 'active' else 'inactive' end,
      entitlement_plan,
      'revenuecat',
      target_user_id::text || ':' || entitlement_name,
      entitlement_name,
      target_event_at,
      nullif(btrim(coalesce(target_management_url, '')), ''),
      now()
    )
    on conflict (provider, provider_subscription_id) do update set
      user_id = excluded.user_id,
      status = excluded.status,
      plan = excluded.plan,
      entitlement = excluded.entitlement,
      provider_event_at = excluded.provider_event_at,
      management_url = excluded.management_url,
      updated_at = excluded.updated_at;
  end loop;

  perform private.recompute_effective_plan_v1(target_user_id);

  analytics_name := case event_type
    when 'INITIAL_PURCHASE' then 'purchase_success'
    when 'NON_RENEWING_PURCHASE' then 'purchase_success'
    when 'RENEWAL' then 'subscription_renewed'
    when 'CANCELLATION' then 'subscription_cancelled'
    when 'EXPIRATION' then 'subscription_cancelled'
    else null
  end;
  if analytics_name is not null then
    insert into public.analytics_events (user_id, event_name, source, properties)
    values (
      target_user_id,
      analytics_name,
      'revenuecat',
      jsonb_build_object('event_type', event_type, 'entitlements', to_jsonb(clean_entitlements))
    );
  end if;

  return true;
end;
$$;
revoke all on function private.sync_revenuecat_entitlements_v1(text, text, uuid, timestamptz, text[], text) from public, anon, authenticated, service_role;
grant execute on function private.sync_revenuecat_entitlements_v1(text, text, uuid, timestamptz, text[], text) to service_role;

create or replace function public.sync_revenuecat_entitlements_v1(
  revenuecat_event_id text,
  revenuecat_event_type text,
  target_user_id uuid,
  target_event_at timestamptz,
  active_entitlements text[],
  target_management_url text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.sync_revenuecat_entitlements_v1(
    revenuecat_event_id,
    revenuecat_event_type,
    target_user_id,
    target_event_at,
    active_entitlements,
    target_management_url
  );
$$;
revoke all on function public.sync_revenuecat_entitlements_v1(text, text, uuid, timestamptz, text[], text) from public, anon, authenticated, service_role;
grant execute on function public.sync_revenuecat_entitlements_v1(text, text, uuid, timestamptz, text[], text) to service_role;

create or replace function private.get_my_entitlements_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_plan text;
  manage_url text;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  select p.plan into actor_plan from public.profiles p where p.id = actor_id;
  if actor_plan is null then raise exception 'profile not found'; end if;

  select s.management_url into manage_url
  from public.subscriptions s
  where s.user_id = actor_id
    and s.provider = 'revenuecat'
    and s.status in ('active', 'trialing')
    and s.management_url is not null
  order by s.provider_event_at desc nulls last, s.updated_at desc
  limit 1;

  return jsonb_build_object(
    'plan', actor_plan,
    'proof_plus', actor_plan in ('pro', 'creator', 'black'),
    'creator', actor_plan in ('creator', 'black'),
    'black', actor_plan = 'black',
    'management_url', manage_url
  );
end;
$$;
revoke all on function private.get_my_entitlements_v1() from public, anon, authenticated, service_role;
grant execute on function private.get_my_entitlements_v1() to authenticated, service_role;

create or replace function public.get_my_entitlements_v1()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_my_entitlements_v1();
$$;
revoke all on function public.get_my_entitlements_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_my_entitlements_v1() to authenticated, service_role;

-- Legacy Stripe remains a compatibility source, but effective plan recomputation is shared.
create or replace function public.sync_stripe_subscription_event(
  stripe_event_id text,
  stripe_event_type text,
  target_subscription_id text,
  target_customer_id text,
  target_user_id uuid,
  target_status text,
  target_plan text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_plan text;
  effective_plan text;
begin
  if stripe_event_id is null or btrim(stripe_event_id) = '' then raise exception 'event id required'; end if;
  if target_subscription_id is null or btrim(target_subscription_id) = '' then raise exception 'subscription id required'; end if;
  if target_customer_id is null or btrim(target_customer_id) = '' then raise exception 'customer id required'; end if;
  if target_user_id is not null and target_status in ('active', 'trialing') and target_plan not in ('pro', 'creator') then
    raise exception 'invalid active subscription plan';
  end if;

  insert into public.billing_events (event_id, event_type)
  values (stripe_event_id, coalesce(stripe_event_type, 'unknown'))
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  insert into public.subscriptions (
    stripe_subscription_id, stripe_customer_id, user_id, status, plan,
    provider, provider_subscription_id, entitlement, updated_at
  ) values (
    target_subscription_id, target_customer_id, target_user_id, target_status, target_plan,
    'stripe', target_subscription_id, null, now()
  )
  on conflict (stripe_subscription_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    user_id = excluded.user_id,
    status = excluded.status,
    plan = excluded.plan,
    provider = 'stripe',
    provider_subscription_id = excluded.provider_subscription_id,
    entitlement = null,
    updated_at = excluded.updated_at;

  if target_user_id is not null then
    select p.plan into previous_plan from public.profiles p where p.id = target_user_id;
    effective_plan := private.recompute_effective_plan_v1(target_user_id);
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
revoke all on function public.sync_stripe_subscription_event(text, text, text, text, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.sync_stripe_subscription_event(text, text, text, text, uuid, text, text) to service_role;

-- Black inherits Creator challenge capacity and remains server-owned.
create or replace function private.challenge_configuration_allowed(target_visibility text, target_seat_cap int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select p.plan from public.profiles p where p.id = auth.uid()), 'free')
    when 'black' then target_seat_cap is null or target_seat_cap <= 100000
    when 'creator' then target_seat_cap is null or target_seat_cap <= 100000
    when 'pro' then target_seat_cap is null or target_seat_cap <= 25
    else target_visibility <> 'private' and (target_seat_cap is null or target_seat_cap <= 5)
  end;
$$;
revoke all on function private.challenge_configuration_allowed(text, int) from public, anon, authenticated, service_role;
grant execute on function private.challenge_configuration_allowed(text, int) to authenticated, service_role;
