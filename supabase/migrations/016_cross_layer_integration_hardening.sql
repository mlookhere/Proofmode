-- Cross-layer integration hardening after Journey/Proof/Passport.
-- Preserve existing API contracts while tightening ownership and transaction boundaries.

-- v3 post creation/lifecycle is server-owned. Clients keep read access only.
revoke insert, update, delete on table public.posts from anon, authenticated;
drop policy if exists "users create own posts" on public.posts;
drop policy if exists "users update own unpublished posts" on public.posts;
drop policy if exists "users delete own posts" on public.posts;

-- Assign a post to its Journey only after the server-owned post row exists.
-- Reset attempt mutation and post linkage happen in the same database transaction,
-- so any link failure rolls the Reset back too.
create or replace function private.assign_post_journey_v1(
  target_post uuid,
  request_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  post_challenge uuid;
  post_kind text;
  post_status text;
  current_journey uuid;
  assigned_journey_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;

  select p.challenge_id, p.kind, p.status, p.journey_id
  into post_challenge, post_kind, post_status, current_journey
  from public.posts p
  where p.id = target_post and p.user_id = actor_id
  for update;

  if not found then raise exception 'post not found'; end if;
  if post_challenge is null then raise exception 'Drop context required'; end if;
  if post_status in ('published', 'removed') then raise exception 'post Journey can no longer change'; end if;

  if current_journey is not null then
    if not exists (
      select 1
      from public.journeys j
      where j.id = current_journey
        and j.user_id = actor_id
        and j.challenge_id = post_challenge
    ) then
      raise exception 'post Journey is invalid';
    end if;
    return current_journey;
  end if;

  if post_kind = 'reset' then
    assigned_journey_id := private.reset_journey_v1(post_challenge, request_token);
  else
    assigned_journey_id := private.ensure_journey_v1(post_challenge);
  end if;

  update public.posts p
  set journey_id = assigned_journey_id, updated_at = now()
  where p.id = target_post
    and p.user_id = actor_id
    and p.journey_id is null;

  if not found then raise exception 'post Journey changed; retry'; end if;
  return assigned_journey_id;
end;
$$;

revoke all on function private.assign_post_journey_v1(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.assign_post_journey_v1(uuid, text) to authenticated, service_role;

create or replace function public.assign_post_journey_v1(
  target_post uuid,
  request_token text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.assign_post_journey_v1(target_post, request_token);
$$;
revoke all on function public.assign_post_journey_v1(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.assign_post_journey_v1(uuid, text) to authenticated, service_role;

-- Move remaining privileged public API implementations behind invoker wrappers.
alter function public.get_challenge_landing(text, text) set schema private;
alter function public.get_feed_v1(integer, numeric, timestamptz, uuid) set schema private;
alter function public.get_public_challenge_snapshot(text) set schema private;
alter function public.join_challenge_v2(text, text) set schema private;

-- Black inherits Creator capacity everywhere, including join enforcement.
create or replace function private.join_challenge_v2(target_slug text, target_invite_code text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    select * into invite_row
    from public.invites i
    where i.code = target_invite_code and i.challenge_id = cid
    limit 1;
  end if;

  if vis <> 'public' and invite_row.id is null and oid <> auth.uid() then
    raise exception 'invite required';
  end if;
  if exists (
    select 1 from public.challenge_members cm
    where cm.challenge_id = cid and cm.user_id = auth.uid()
  ) then
    return cid;
  end if;

  select p.plan into owner_plan from public.profiles p where p.id = oid;
  member_limit := case
    when owner_plan in ('creator', 'black') then 100000
    when owner_plan = 'pro' then 25
    else 5
  end;
  if cap is not null then member_limit := least(member_limit, cap); end if;

  select count(*) into current_count
  from public.challenge_members cm
  where cm.challenge_id = cid;
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
end;
$$;

revoke all on function private.get_challenge_landing(text, text) from public, anon, authenticated, service_role;
revoke all on function private.get_feed_v1(integer, numeric, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function private.get_public_challenge_snapshot(text) from public, anon, authenticated, service_role;
revoke all on function private.join_challenge_v2(text, text) from public, anon, authenticated, service_role;
grant execute on function private.get_challenge_landing(text, text) to anon, authenticated, service_role;
grant execute on function private.get_feed_v1(integer, numeric, timestamptz, uuid) to anon, authenticated, service_role;
grant execute on function private.get_public_challenge_snapshot(text) to anon, authenticated, service_role;
grant execute on function private.join_challenge_v2(text, text) to authenticated, service_role;

create function public.get_challenge_landing(target_slug text, target_invite_code text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_challenge_landing(target_slug, target_invite_code);
$$;

create function public.get_feed_v1(
  max_items integer default 20,
  cursor_score numeric default null,
  cursor_time timestamptz default null,
  cursor_post_id uuid default null
)
returns table (
  post_id uuid,
  kind text,
  caption text,
  published_at timestamptz,
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  challenge_id uuid,
  challenge_slug text,
  challenge_title text,
  journey_id uuid,
  proof_id uuid,
  media_id uuid,
  media_kind text,
  media_provider text,
  media_public_url text,
  media_playback_id text,
  reaction_count bigint,
  comment_count bigint,
  viewer_follows boolean,
  viewer_reaction text,
  score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_feed_v1(max_items, cursor_score, cursor_time, cursor_post_id);
$$;

create function public.get_public_challenge_snapshot(target_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_public_challenge_snapshot(target_slug);
$$;

create function public.join_challenge_v2(target_slug text, target_invite_code text default null)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.join_challenge_v2(target_slug, target_invite_code);
$$;

revoke all on function public.get_challenge_landing(text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_feed_v1(integer, numeric, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_public_challenge_snapshot(text) from public, anon, authenticated, service_role;
revoke all on function public.join_challenge_v2(text, text) from public, anon, authenticated, service_role;
grant execute on function public.get_challenge_landing(text, text) to anon, authenticated, service_role;
grant execute on function public.get_feed_v1(integer, numeric, timestamptz, uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_challenge_snapshot(text) to anon, authenticated, service_role;
grant execute on function public.join_challenge_v2(text, text) to authenticated, service_role;
