-- Keep future-dated posts out of the public feed without changing ranking or cursor semantics.
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
    r.score
  from ranked r
  where cursor_score is null
     or cursor_time is null
     or cursor_post_id is null
     or (r.score, r.published_at, r.post_id) < (cursor_score, cursor_time, cursor_post_id)
  order by r.score desc, r.published_at desc, r.post_id desc
  limit greatest(1, least(max_items, 50));
$$;

grant execute on function public.get_feed_v1(int, numeric, timestamptz, uuid) to anon, authenticated;
