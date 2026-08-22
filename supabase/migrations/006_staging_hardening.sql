-- Staging hardening: keep the canonical template set and hide policy helpers from the Data API.

-- 003 shipped a starter set before 004 established the canonical 60-template launch library.
delete from public.challenge_templates
where id in ('declutter-10', 'desk-reset', 'no-doordash', 'stairs', 'water-break');

-- SECURITY DEFINER helpers belong outside the exposed API schema. Policies keep their
-- function dependencies when the functions move; public RPCs below are refreshed where
-- their SQL bodies explicitly referenced the old public helper names.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

alter function public.is_challenge_member(uuid) set schema private;
alter function public.is_challenge_owner(uuid) set schema private;
alter function public.challenge_configuration_allowed(text, int) set schema private;
alter function public.challenge_create_allowed(text, int) set schema private;
alter function public.is_blocked_pair(uuid, uuid) set schema private;
alter function public.can_view_post(uuid) set schema private;

create or replace function private.challenge_create_allowed(target_visibility text, target_seat_cap int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_plan text;
  owned_count int;
begin
  if actor_id is null then return false; end if;

  select p.plan into actor_plan from public.profiles p where p.id = actor_id for update;
  if actor_plan is null then return false; end if;
  if not private.challenge_configuration_allowed(target_visibility, target_seat_cap) then return false; end if;

  if actor_plan = 'free' then
    select count(*) into owned_count from public.challenges c where c.owner_id = actor_id;
    if owned_count >= 1 then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function private.can_view_post(target_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.posts p
    left join public.challenges c on c.id = p.challenge_id
    where p.id = target_post
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and not private.is_blocked_pair(auth.uid(), p.user_id)
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (p.visibility = 'crew' and p.challenge_id is not null and private.is_challenge_member(p.challenge_id))
      )
  );
$$;

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
      or private.is_challenge_member(c.id)
      or exists (select 1 from public.invites i where i.challenge_id = c.id and i.code = target_invite_code)
    )
  limit 1
) x;
$$;

create or replace function public.get_feed_v1(
  max_items int default 20,
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
  score numeric
) language sql stable security definer set search_path = '' as $$
  with ranked as (
    select
      p.id as post_id,
      p.kind,
      p.caption,
      p.published_at,
      p.user_id,
      pr.handle,
      pr.display_name,
      pr.avatar_url,
      p.challenge_id,
      ch.slug as challenge_slug,
      ch.title as challenge_title,
      p.journey_id,
      p.proof_id,
      m.id as media_id,
      m.media_kind,
      m.provider as media_provider,
      m.public_url as media_public_url,
      m.playback_id as media_playback_id,
      reactions.count as reaction_count,
      comments.count as comment_count,
      (
        reactions.count * 2
        + comments.count * 3
        + case when exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = p.user_id) then 25 else 0 end
        + case when p.challenge_id is not null and exists (select 1 from public.watched_challenges w where w.user_id = auth.uid() and w.challenge_id = p.challenge_id) then 15 else 0 end
        + case when ch.category is not null and exists (select 1 from public.user_interests ui where ui.user_id = auth.uid() and ui.interest = ch.category) then 10 else 0 end
        + extract(epoch from p.published_at) / 86400.0
      )::numeric as score
    from public.posts p
    left join public.profiles pr on pr.id = p.user_id
    left join public.challenges ch on ch.id = p.challenge_id
    left join public.media_assets m on m.id = p.media_asset_id
    left join lateral (
      select count(*) as count from public.post_reactions r where r.post_id = p.id
    ) reactions on true
    left join lateral (
      select count(*) as count from public.comments c where c.post_id = p.id and c.status = 'published'
    ) comments on true
    where p.status = 'published'
      and p.moderation_status = 'approved'
      and p.visibility = 'public'
      and p.published_at is not null
      and not private.is_blocked_pair(auth.uid(), p.user_id)
      and (m.id is null or (m.processing_status = 'ready' and m.moderation_status = 'approved'))
  )
  select
    r.post_id,
    r.kind,
    r.caption,
    r.published_at,
    r.user_id,
    r.handle,
    r.display_name,
    r.avatar_url,
    r.challenge_id,
    r.challenge_slug,
    r.challenge_title,
    r.journey_id,
    r.proof_id,
    r.media_id,
    r.media_kind,
    r.media_provider,
    r.media_public_url,
    r.media_playback_id,
    r.reaction_count,
    r.comment_count,
    r.score
  from ranked r
  where cursor_score is null
     or cursor_time is null
     or cursor_post_id is null
     or (r.score, r.published_at, r.post_id) < (cursor_score, cursor_time, cursor_post_id)
  order by r.score desc, r.published_at desc, r.post_id desc
  limit greatest(1, least(max_items, 50));
$$;

create or replace function public.get_journey_posts(target_journey uuid)
returns table (
  post_id uuid,
  kind text,
  caption text,
  published_at timestamptz,
  proof_id uuid,
  media_kind text,
  media_public_url text,
  media_playback_id text
) language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.caption, p.published_at, p.proof_id,
         m.media_kind, m.public_url, m.playback_id
  from public.posts p
  left join public.media_assets m on m.id = p.media_asset_id
  where p.journey_id = target_journey and private.can_view_post(p.id)
  order by p.published_at asc nulls last, p.created_at asc;
$$;

-- Internal helpers are callable by RLS roles but cannot be reached through the exposed public schema.
revoke all on function private.is_challenge_member(uuid) from public, anon, authenticated;
revoke all on function private.is_challenge_owner(uuid) from public, anon, authenticated;
revoke all on function private.challenge_configuration_allowed(text, int) from public, anon, authenticated;
revoke all on function private.challenge_create_allowed(text, int) from public, anon, authenticated;
revoke all on function private.is_blocked_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_post(uuid) from public, anon, authenticated;
grant execute on function private.is_challenge_member(uuid) to anon, authenticated;
grant execute on function private.is_challenge_owner(uuid) to anon, authenticated;
grant execute on function private.challenge_configuration_allowed(text, int) to authenticated;
grant execute on function private.challenge_create_allowed(text, int) to authenticated;
grant execute on function private.is_blocked_pair(uuid, uuid) to anon, authenticated;
grant execute on function private.can_view_post(uuid) to anon, authenticated;

-- Trigger/server-only functions are never client RPCs.
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_challenge() from public, anon, authenticated, service_role;
revoke all on function public.sync_stripe_subscription_event(text, text, text, text, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.sync_stripe_subscription_event(text, text, text, text, uuid, text, text) to service_role;

-- The v2 join RPC superseded the legacy public-only join endpoint.
drop function if exists public.join_public_challenge(text);

-- Restrict public RPC ACLs explicitly instead of inheriting PostgreSQL/Supabase defaults.
revoke all on function public.join_challenge_v2(text, text) from public, anon, authenticated;
grant execute on function public.join_challenge_v2(text, text) to authenticated;

revoke all on function public.get_public_challenge_snapshot(text) from public, anon, authenticated;
revoke all on function public.get_profile_snapshot(text) from public, anon, authenticated;
revoke all on function public.get_challenge_landing(text, text) from public, anon, authenticated;
revoke all on function public.get_feed_v1(int, numeric, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_journey_posts(uuid) from public, anon, authenticated;
grant execute on function public.get_public_challenge_snapshot(text) to anon, authenticated;
grant execute on function public.get_profile_snapshot(text) to anon, authenticated;
grant execute on function public.get_challenge_landing(text, text) to anon, authenticated;
grant execute on function public.get_feed_v1(int, numeric, timestamptz, uuid) to anon, authenticated;
grant execute on function public.get_journey_posts(uuid) to anon, authenticated;

-- Server-owned tables are not part of the client Data API surface.
revoke all on table public.billing_events, public.moderation_actions, public.job_outbox from anon, authenticated;

-- Future functions start closed. Any client RPC must opt in with an explicit GRANT.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
