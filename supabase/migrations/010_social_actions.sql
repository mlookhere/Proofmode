-- Social actions + Crew room contracts. Keep membership on the existing challenge model.

create table if not exists public.crew_messages (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists crew_messages_challenge_created_idx
  on public.crew_messages(challenge_id, created_at desc, id desc);

create unique index if not exists reports_open_target_reason_idx
  on public.reports(reporter_id, target_type, target_id, reason)
  where status in ('open', 'reviewing');

alter table public.crew_messages enable row level security;

drop policy if exists "crew members read room messages" on public.crew_messages;
create policy "crew members read room messages" on public.crew_messages for select
using (
  private.is_challenge_member(challenge_id)
  and not private.is_blocked_pair(auth.uid(), user_id)
);

drop policy if exists "crew members create room messages" on public.crew_messages;
create policy "crew members create room messages" on public.crew_messages for insert
with check (user_id = auth.uid() and private.is_challenge_member(challenge_id));

drop policy if exists "users delete own room messages" on public.crew_messages;
create policy "users delete own room messages" on public.crew_messages for delete
using (user_id = auth.uid());

-- Profiles and comments must honor blocks independently of the parent post.
drop policy if exists "profiles public read" on public.profiles;
drop policy if exists "profiles visible unless blocked" on public.profiles;
create policy "profiles visible unless blocked" on public.profiles for select
using (id = auth.uid() or not private.is_blocked_pair(auth.uid(), id));

drop policy if exists "view comments on visible posts" on public.comments;
create policy "view comments on visible posts" on public.comments for select
using (
  status = 'published'
  and private.can_view_post(post_id)
  and not private.is_blocked_pair(auth.uid(), user_id)
);

drop policy if exists "users comment" on public.comments;
create policy "users comment" on public.comments for insert
with check (
  user_id = auth.uid()
  and status = 'published'
  and private.can_view_post(post_id)
);

drop policy if exists "users change own reaction" on public.post_reactions;
create policy "users change own reaction" on public.post_reactions for update
using (user_id = auth.uid() and private.can_view_post(post_id))
with check (user_id = auth.uid() and private.can_view_post(post_id));

-- Mutations are RPC-owned so multi-table invariants stay atomic.
revoke insert, update, delete on table public.follows from authenticated;
revoke insert, update, delete on table public.post_reactions from authenticated;
revoke insert, update, delete on table public.comments from authenticated;
revoke insert, update, delete on table public.blocks from authenticated;
revoke insert, update, delete on table public.reports from authenticated;
revoke insert, update, delete on table public.crew_messages from authenticated;

grant select on table public.follows to authenticated;
grant select on table public.post_reactions to authenticated;
grant select on table public.comments to authenticated;
grant select on table public.blocks to authenticated;
grant select on table public.reports to authenticated;
grant select on table public.crew_messages to authenticated;

create or replace function public.set_follow_v1(target_user uuid, should_follow boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if target_user is null or target_user = actor_id then raise exception 'invalid follow target'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user) then raise exception 'user not found'; end if;

  if should_follow then
    if private.is_blocked_pair(actor_id, target_user) then raise exception 'interaction blocked'; end if;
    insert into public.follows (follower_id, followed_id)
    values (actor_id, target_user)
    on conflict do nothing;
    return true;
  end if;

  delete from public.follows f where f.follower_id = actor_id and f.followed_id = target_user;
  return false;
end;
$$;

create or replace function public.set_post_reaction_v1(target_post uuid, target_reaction text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if not private.can_view_post(target_post) then raise exception 'post not visible'; end if;

  if target_reaction is null then
    delete from public.post_reactions r where r.post_id = target_post and r.user_id = actor_id;
    return null;
  end if;

  if target_reaction not in ('proven', 'respect', 'lol', 'run_it_back', 'im_next') then
    raise exception 'invalid reaction';
  end if;

  insert into public.post_reactions (post_id, user_id, reaction)
  values (target_post, actor_id, target_reaction)
  on conflict (post_id, user_id) do update
    set reaction = excluded.reaction, created_at = now();

  return target_reaction;
end;
$$;

create or replace function public.create_comment_v1(target_post uuid, target_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  clean_body text := btrim(coalesce(target_body, ''));
  created_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 500 then raise exception 'comment must be 1 to 500 characters'; end if;
  if not private.can_view_post(target_post) then raise exception 'post not visible'; end if;

  insert into public.comments (post_id, user_id, body)
  values (target_post, actor_id, clean_body)
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.delete_comment_v1(target_comment uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  delete from public.comments c where c.id = target_comment and c.user_id = actor_id;
  return found;
end;
$$;

create or replace function public.set_block_v1(target_user uuid, should_block boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if target_user is null or target_user = actor_id then raise exception 'invalid block target'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user) then raise exception 'user not found'; end if;

  if should_block then
    insert into public.blocks (blocker_id, blocked_id)
    values (actor_id, target_user)
    on conflict do nothing;

    delete from public.follows f
    where (f.follower_id = actor_id and f.followed_id = target_user)
       or (f.follower_id = target_user and f.followed_id = actor_id);
    return true;
  end if;

  delete from public.blocks b where b.blocker_id = actor_id and b.blocked_id = target_user;
  return false;
end;
$$;

create or replace function public.submit_report_v1(
  target_type text,
  target_id uuid,
  target_reason text,
  target_details text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  report_id uuid;
  details_value text := nullif(btrim(coalesce(target_details, '')), '');
  allowed boolean := false;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if target_id is null then raise exception 'report target required'; end if;
  if target_type not in ('post', 'comment', 'user', 'challenge') then raise exception 'invalid report target'; end if;
  if target_reason not in ('spam', 'harassment', 'hate', 'dangerous', 'sexual', 'self_harm', 'illegal', 'impersonation', 'other') then
    raise exception 'invalid report reason';
  end if;
  if details_value is not null and char_length(details_value) > 1000 then raise exception 'report details too long'; end if;

  case target_type
    when 'post' then
      select private.can_view_post(target_id) into allowed;
    when 'comment' then
      select exists (
        select 1 from public.comments c
        where c.id = target_id
          and c.status = 'published'
          and private.can_view_post(c.post_id)
          and not private.is_blocked_pair(actor_id, c.user_id)
      ) into allowed;
    when 'user' then
      select exists (select 1 from public.profiles p where p.id = target_id and p.id <> actor_id) into allowed;
    when 'challenge' then
      select exists (
        select 1 from public.challenges c
        where c.id = target_id
          and (
            c.visibility = 'public'
            or c.owner_id = actor_id
            or private.is_challenge_member(c.id)
          )
      ) into allowed;
  end case;

  if not allowed then raise exception 'report target not visible'; end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (actor_id, target_type, target_id::text, target_reason, details_value)
  on conflict (reporter_id, target_type, target_id, reason)
    where status in ('open', 'reviewing')
  do update set details = coalesce(excluded.details, public.reports.details)
  returning id into report_id;

  return report_id;
end;
$$;

create or replace function public.get_post_comments_v1(target_post uuid, max_items int default 50)
returns table (
  comment_id uuid,
  user_id uuid,
  display_name text,
  handle text,
  body text,
  created_at timestamptz,
  is_own boolean
) language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.user_id,
    coalesce(p.display_name, p.handle, 'Member'),
    p.handle,
    c.body,
    c.created_at,
    c.user_id = auth.uid()
  from public.comments c
  left join public.profiles p on p.id = c.user_id
  where c.post_id = target_post
    and c.status = 'published'
    and private.can_view_post(target_post)
    and not private.is_blocked_pair(auth.uid(), c.user_id)
  order by c.created_at asc, c.id asc
  limit greatest(1, least(max_items, 100));
$$;

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
    (select count(*) from public.challenge_members all_members where all_members.challenge_id = c.id),
    greatest(
      c.created_at,
      coalesce((select max(p.created_at) from public.posts p where p.challenge_id = c.id), c.created_at),
      coalesce((select max(m.created_at) from public.crew_messages m where m.challenge_id = c.id), c.created_at)
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
    select c.id, c.title, c.slug, c.rule, c.cover_emoji, c.owner_id, c.created_at
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
      and private.can_view_post(p.id)
    order by p.published_at desc nulls last, p.created_at desc, p.id desc
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
    'member_count', (select count(*)::int from public.challenge_members cm where cm.challenge_id = t.id),
    'members', coalesce((select jsonb_agg(to_jsonb(r) order by r.rank) from ranked r), '[]'::jsonb),
    'leaderboard', coalesce((select jsonb_agg(to_jsonb(r) order by r.rank) from (select * from ranked order by rank limit 10) r), '[]'::jsonb),
    'recent_activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.published_at desc nulls last) from recent a), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at asc) from messages m), '[]'::jsonb)
  ) into result
  from target t;

  return result;
end;
$$;

create or replace function public.post_crew_message_v1(target_crew uuid, target_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  clean_body text := btrim(coalesce(target_body, ''));
  message_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 500 then raise exception 'message must be 1 to 500 characters'; end if;
  if not exists (
    select 1 from public.challenges c
    where c.id = target_crew and c.format = 'crew' and private.is_challenge_member(c.id)
  ) then raise exception 'crew not visible'; end if;

  insert into public.crew_messages (challenge_id, user_id, body)
  values (target_crew, actor_id, clean_body)
  returning id into message_id;

  return message_id;
end;
$$;

create or replace function public.delete_crew_message_v1(target_message uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  delete from public.crew_messages m where m.id = target_message and m.user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.create_crew_invite_v1(target_crew uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  invite_code text;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.challenges c
    where c.id = target_crew and c.format = 'crew' and private.is_challenge_member(c.id)
  ) then raise exception 'crew not visible'; end if;

  insert into public.invites (challenge_id, inviter_id)
  values (target_crew, actor_id)
  returning code into invite_code;

  return invite_code;
end;
$$;

-- Block-aware profile snapshot. Keep the existing public metric contract.
create or replace function public.get_profile_snapshot(target_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
with target as (
  select p.id
  from public.profiles p
  where p.handle = target_handle
    and not private.is_blocked_pair(auth.uid(), p.id)
  limit 1
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

-- Extend the feed contract with the signed-in viewer's relationship state without changing ranking.
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
      select count(*) as count from public.post_reactions r where r.post_id = p.id
    ) reactions on true
    left join lateral (
      select count(*) as count from public.comments c
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

-- Public read RPCs.
revoke all on function public.get_post_comments_v1(uuid, int) from public, anon, authenticated;
grant execute on function public.get_post_comments_v1(uuid, int) to anon, authenticated;
revoke all on function public.get_profile_snapshot(text) from public, anon, authenticated;
grant execute on function public.get_profile_snapshot(text) to anon, authenticated;
revoke all on function public.get_feed_v1(int, numeric, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_feed_v1(int, numeric, timestamptz, uuid) to anon, authenticated;

-- Authenticated social/Crew RPCs.
revoke all on function public.set_follow_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_post_reaction_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.create_comment_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_comment_v1(uuid) from public, anon, authenticated;
revoke all on function public.set_block_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.submit_report_v1(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_my_crews_v1() from public, anon, authenticated;
revoke all on function public.get_crew_room_v1(uuid) from public, anon, authenticated;
revoke all on function public.post_crew_message_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_crew_message_v1(uuid) from public, anon, authenticated;
revoke all on function public.create_crew_invite_v1(uuid) from public, anon, authenticated;

grant execute on function public.set_follow_v1(uuid, boolean) to authenticated;
grant execute on function public.set_post_reaction_v1(uuid, text) to authenticated;
grant execute on function public.create_comment_v1(uuid, text) to authenticated;
grant execute on function public.delete_comment_v1(uuid) to authenticated;
grant execute on function public.set_block_v1(uuid, boolean) to authenticated;
grant execute on function public.submit_report_v1(text, uuid, text, text) to authenticated;
grant execute on function public.get_my_crews_v1() to authenticated;
grant execute on function public.get_crew_room_v1(uuid) to authenticated;
grant execute on function public.post_crew_message_v1(uuid, text) to authenticated;
grant execute on function public.delete_crew_message_v1(uuid) to authenticated;
grant execute on function public.create_crew_invite_v1(uuid) to authenticated;
