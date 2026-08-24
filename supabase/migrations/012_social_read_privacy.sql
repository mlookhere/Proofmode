-- Tighten Social Actions read models so blocked users do not contribute hidden aggregate activity.

create or replace function public.get_my_crews_v1()
returns table (
  crew_id uuid,
  title text,
  slug text,
  cover_emoji text,
  member_count bigint,
  last_activity_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.title,
    c.slug,
    c.cover_emoji,
    (
      select count(*)
      from public.challenge_members all_members
      where all_members.challenge_id = c.id
        and not private.is_blocked_pair(auth.uid(), all_members.user_id)
    ),
    greatest(
      c.created_at,
      coalesce((
        select max(p.published_at)
        from public.posts p
        where p.challenge_id = c.id
          and p.status = 'published'
          and p.moderation_status = 'approved'
          and p.published_at is not null
          and p.published_at <= now()
          and private.can_view_post(p.id)
      ), c.created_at),
      coalesce((
        select max(m.created_at)
        from public.crew_messages m
        where m.challenge_id = c.id
          and not private.is_blocked_pair(auth.uid(), m.user_id)
      ), c.created_at)
    )
  from public.challenges c
  join public.challenge_members mine on mine.challenge_id = c.id and mine.user_id = auth.uid()
  where auth.uid() is not null and c.format = 'crew'
  order by 6 desc, c.id desc;
$$;

create or replace function public.get_crew_room_v1(target_crew uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.challenges c
    where c.id = target_crew
      and c.format = 'crew'
      and private.is_challenge_member(c.id)
  ) then raise exception 'crew not visible'; end if;

  with target as (
    select c.id, c.title, c.slug, c.rule, c.cover_emoji, c.owner_id
    from public.challenges c
    where c.id = target_crew
  ),
  receipt_counts as (
    select pr.user_id,
           count(*)::int as receipts,
           count(*) filter (where exists (
             select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true
           ))::int as verified_receipts
    from public.proofs pr
    where pr.challenge_id = target_crew
      and not private.is_blocked_pair(auth.uid(), pr.user_id)
    group by pr.user_id
  ),
  ranked as (
    select cm.user_id,
           coalesce(p.display_name, p.handle, 'Member') as display_name,
           p.handle,
           cm.role,
           cm.founder,
           coalesce(rc.receipts, 0)::int as receipts,
           coalesce(rc.verified_receipts, 0)::int as verified_receipts,
           (coalesce(rc.verified_receipts, 0) * 10 + coalesce(rc.receipts, 0) * 2)::int as proof_score,
           row_number() over (
             order by coalesce(rc.verified_receipts, 0) desc, coalesce(rc.receipts, 0) desc, cm.joined_at asc
           )::int as rank
    from public.challenge_members cm
    left join public.profiles p on p.id = cm.user_id
    left join receipt_counts rc on rc.user_id = cm.user_id
    where cm.challenge_id = target_crew
      and not private.is_blocked_pair(auth.uid(), cm.user_id)
  ),
  recent as (
    select p.id as post_id,
           p.kind,
           p.caption,
           p.published_at,
           p.user_id,
           coalesce(pr.display_name, pr.handle, 'Member') as display_name,
           pr.handle
    from public.posts p
    left join public.profiles pr on pr.id = p.user_id
    where p.challenge_id = target_crew
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and p.published_at is not null
      and p.published_at <= now()
      and private.can_view_post(p.id)
    order by p.published_at desc, p.id desc
    limit 20
  ),
  messages as (
    select m.id as message_id,
           m.user_id,
           coalesce(p.display_name, p.handle, 'Member') as display_name,
           p.handle,
           m.body,
           m.created_at,
           m.user_id = auth.uid() as is_own
    from public.crew_messages m
    left join public.profiles p on p.id = m.user_id
    where m.challenge_id = target_crew
      and not private.is_blocked_pair(auth.uid(), m.user_id)
    order by m.created_at desc, m.id desc
    limit 50
  )
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'slug', t.slug,
    'rule', t.rule,
    'cover_emoji', t.cover_emoji,
    'owner_id', t.owner_id,
    'member_count', (select count(*)::int from ranked),
    'members', coalesce((select jsonb_agg(to_jsonb(r) order by r.rank) from ranked r), '[]'::jsonb),
    'leaderboard', coalesce((select jsonb_agg(to_jsonb(r) order by r.rank) from (select * from ranked order by rank limit 10) r), '[]'::jsonb),
    'recent_activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.published_at desc) from recent a), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc) from messages m), '[]'::jsonb)
  ) into result
  from target t;

  return result;
end;
$$;

-- Preserve the exact feed contract from migration 010 while excluding blocked users from aggregates.
drop function if exists public.get_feed_v1(int, numeric, timestamptz, uuid);
create function public.get_feed_v1(
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
  viewer_follows boolean,
  viewer_reaction text,
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
      exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.followed_id = p.user_id
      ) as viewer_follows,
      (
        select r.reaction from public.post_reactions r
        where r.post_id = p.id and r.user_id = auth.uid()
        limit 1
      ) as viewer_reaction,
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
      select count(*) as count
      from public.post_reactions r
      where r.post_id = p.id
        and not private.is_blocked_pair(auth.uid(), r.user_id)
    ) reactions on true
    left join lateral (
      select count(*) as count
      from public.comments c
      where c.post_id = p.id
        and c.status = 'published'
        and not private.is_blocked_pair(auth.uid(), c.user_id)
    ) comments on true
    where p.status = 'published'
      and p.moderation_status = 'approved'
      and p.visibility = 'public'
      and p.published_at is not null
      and p.published_at <= now()
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
    r.viewer_follows,
    r.viewer_reaction,
    r.score
  from ranked r
  where cursor_score is null
     or cursor_time is null
     or cursor_post_id is null
     or (r.score, r.published_at, r.post_id) < (cursor_score, cursor_time, cursor_post_id)
  order by r.score desc, r.published_at desc, r.post_id desc
  limit greatest(1, least(max_items, 50));
$$;

revoke all on function public.get_my_crews_v1() from public, anon, authenticated;
grant execute on function public.get_my_crews_v1() to authenticated;
revoke all on function public.get_crew_room_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_crew_room_v1(uuid) to authenticated;
revoke all on function public.get_feed_v1(int, numeric, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_feed_v1(int, numeric, timestamptz, uuid) to anon, authenticated;
