-- Journey + verified proof ledger + Passport MVP.
-- Existing journeys/proofs remain canonical; this migration links them to the v3 post/media lifecycle.

alter table public.journeys
  add column if not exists attempt_token text
    check (attempt_token is null or char_length(attempt_token) between 8 and 120);

create unique index if not exists journeys_active_user_challenge_idx
  on public.journeys(user_id, challenge_id)
  where status = 'active';
create unique index if not exists journeys_attempt_token_idx
  on public.journeys(user_id, challenge_id, attempt_token)
  where attempt_token is not null;

alter table public.proofs
  alter column media_url drop not null;
alter table public.proofs
  add column if not exists post_id uuid references public.posts(id) on delete set null,
  add column if not exists journey_id uuid references public.journeys(id) on delete set null,
  add column if not exists media_asset_id uuid references public.media_assets(id) on delete set null;

create unique index if not exists proofs_post_unique_idx
  on public.proofs(post_id)
  where post_id is not null;
create index if not exists proofs_journey_date_idx
  on public.proofs(journey_id, proof_date, id)
  where journey_id is not null;
create index if not exists proofs_media_asset_idx
  on public.proofs(media_asset_id)
  where media_asset_id is not null;

create table if not exists public.journey_follows (
  journey_id uuid not null references public.journeys(id) on delete cascade,
  follower_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (journey_id, follower_id)
);
create index if not exists journey_follows_follower_idx
  on public.journey_follows(follower_id, created_at desc, journey_id);
alter table public.journey_follows enable row level security;

create or replace function private.can_view_journey_v1(target_journey uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.journeys j
    where j.id = target_journey
      and not private.is_blocked_pair(auth.uid(), j.user_id)
      and (
        j.user_id = auth.uid()
        or j.visibility = 'public'
        or (j.visibility = 'crew' and private.is_challenge_member(j.challenge_id))
      )
  );
$$;
revoke all on function private.can_view_journey_v1(uuid) from public, anon, authenticated;

drop policy if exists "journeys visible by audience" on public.journeys;
create policy "journeys visible by audience" on public.journeys for select
using (private.can_view_journey_v1(id));

drop policy if exists "journey follows caller read" on public.journey_follows;
create policy "journey follows caller read" on public.journey_follows for select
using (follower_id = (select auth.uid()) and private.can_view_journey_v1(journey_id));

-- Client writes are RPC-owned. Legacy web proof submission remains available through a narrow RPC below.
revoke insert, update, delete on table public.journeys from anon, authenticated;
revoke insert, update, delete on table public.journey_follows from anon, authenticated;
revoke insert, update, delete on table public.proofs from anon, authenticated;
revoke insert, update, delete on table public.verifications from anon, authenticated;
grant select on table public.journey_follows to authenticated;

create or replace function private.journey_metrics_v1(target_journey uuid)
returns table (verified_count int, current_streak int, best_streak int)
language sql stable security definer set search_path = '' as $$
  with verified_dates as (
    select distinct p.proof_date
    from public.proofs p
    where p.journey_id = target_journey
      and exists (
        select 1 from public.verifications v
        where v.proof_id = p.id and v.verdict = true
      )
  ),
  numbered as (
    select
      proof_date,
      proof_date - row_number() over (order by proof_date)::int as run_key
    from verified_dates
  ),
  runs as (
    select min(proof_date) as start_date,
           max(proof_date) as end_date,
           count(*)::int as streak
    from numbered
    group by run_key
  ),
  latest as (
    select max(proof_date) as last_date from verified_dates
  )
  select
    (select count(*)::int from verified_dates),
    coalesce((
      select r.streak
      from runs r cross join latest l
      where r.end_date = l.last_date
        and l.last_date >= current_date - 1
      limit 1
    ), 0),
    coalesce((select max(r.streak)::int from runs r), 0);
$$;
revoke all on function private.journey_metrics_v1(uuid) from public, anon, authenticated;

create or replace function private.ensure_journey_v1(target_challenge uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  journey_id uuid;
  next_attempt int;
  challenge_visibility text;
begin
  if actor_id is null then raise exception 'authentication required'; end if;

  select c.visibility into challenge_visibility
  from public.challenges c
  where c.id = target_challenge
    and c.format = 'drop'
    and private.is_challenge_member(c.id);
  if challenge_visibility is null then raise exception 'joined Drop required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || target_challenge::text, 0)
  );

  select j.id into journey_id
  from public.journeys j
  where j.user_id = actor_id
    and j.challenge_id = target_challenge
    and j.status = 'active'
  order by j.attempt_no desc
  limit 1;
  if journey_id is not null then return journey_id; end if;

  select coalesce(max(j.attempt_no), 0) + 1 into next_attempt
  from public.journeys j
  where j.user_id = actor_id and j.challenge_id = target_challenge;

  insert into public.journeys (user_id, challenge_id, attempt_no, status, visibility)
  values (actor_id, target_challenge, next_attempt, 'active', challenge_visibility)
  returning id into journey_id;

  return journey_id;
end;
$$;

create or replace function private.reset_journey_v1(target_challenge uuid, request_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  clean_token text := btrim(coalesce(request_token, ''));
  journey_id uuid;
  next_attempt int;
  challenge_visibility text;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if char_length(clean_token) < 8 or char_length(clean_token) > 120 then raise exception 'invalid reset token'; end if;

  select c.visibility into challenge_visibility
  from public.challenges c
  where c.id = target_challenge
    and c.format = 'drop'
    and private.is_challenge_member(c.id);
  if challenge_visibility is null then raise exception 'joined Drop required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || target_challenge::text, 0)
  );

  select j.id into journey_id
  from public.journeys j
  where j.user_id = actor_id
    and j.challenge_id = target_challenge
    and j.attempt_token = clean_token
  limit 1;
  if journey_id is not null then return journey_id; end if;

  update public.journeys j
  set status = 'ended', ended_at = coalesce(j.ended_at, now())
  where j.user_id = actor_id
    and j.challenge_id = target_challenge
    and j.status = 'active';

  select coalesce(max(j.attempt_no), 0) + 1 into next_attempt
  from public.journeys j
  where j.user_id = actor_id and j.challenge_id = target_challenge;

  insert into public.journeys (
    user_id, challenge_id, attempt_no, attempt_token, status, visibility
  ) values (
    actor_id, target_challenge, next_attempt, clean_token, 'active', challenge_visibility
  ) returning id into journey_id;

  return journey_id;
end;
$$;

create or replace function private.set_journey_follow_v1(target_journey uuid, should_follow boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  owner_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if not private.can_view_journey_v1(target_journey) then raise exception 'journey not visible'; end if;

  select j.user_id into owner_id from public.journeys j where j.id = target_journey;
  if owner_id is null or owner_id = actor_id then raise exception 'invalid journey follow target'; end if;
  if private.is_blocked_pair(actor_id, owner_id) then raise exception 'interaction blocked'; end if;

  if should_follow then
    insert into public.journey_follows (journey_id, follower_id)
    values (target_journey, actor_id)
    on conflict do nothing;
    return true;
  end if;

  delete from public.journey_follows jf
  where jf.journey_id = target_journey and jf.follower_id = actor_id;
  return false;
end;
$$;

create or replace function private.set_proof_verification_v1(target_proof uuid, target_verdict boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  proof_owner uuid;
  proof_challenge uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if target_verdict is null then raise exception 'verdict required'; end if;

  select p.user_id, p.challenge_id into proof_owner, proof_challenge
  from public.proofs p
  where p.id = target_proof;
  if proof_owner is null then raise exception 'proof not found'; end if;
  if proof_owner = actor_id then raise exception 'self verification not allowed'; end if;
  if private.is_blocked_pair(actor_id, proof_owner) then raise exception 'interaction blocked'; end if;
  if not private.is_challenge_member(proof_challenge) then raise exception 'challenge membership required'; end if;

  insert into public.verifications (proof_id, verifier_id, verdict)
  values (target_proof, actor_id, target_verdict)
  on conflict (proof_id, verifier_id) do update
    set verdict = excluded.verdict, created_at = now();

  return target_verdict;
end;
$$;

create or replace function private.create_legacy_proof_v1(
  target_challenge uuid,
  target_media_url text,
  target_caption text default '',
  target_proof_type text default 'photo'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  journey_id uuid;
  proof_id uuid;
  clean_media text := nullif(btrim(coalesce(target_media_url, '')), '');
  clean_caption text := left(btrim(coalesce(target_caption, '')), 280);
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if clean_media is null then raise exception 'media required'; end if;
  if target_proof_type not in ('photo', 'video', 'link', 'screenshot') then raise exception 'invalid proof type'; end if;
  journey_id := private.ensure_journey_v1(target_challenge);

  insert into public.proofs (
    challenge_id, user_id, proof_type, media_url, caption, proof_date, journey_id
  ) values (
    target_challenge, actor_id, target_proof_type, clean_media, clean_caption, current_date, journey_id
  ) returning id into proof_id;

  return proof_id;
end;
$$;

-- Publication, not the client, decides whether a v3 post creates a proof receipt.
create or replace function private.sync_published_post_proof_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  receipt_id uuid;
  receipt_date date;
  media_kind text;
  media_url text;
  legacy_type text;
begin
  if new.status <> 'published' or new.moderation_status <> 'approved' then return new; end if;
  if new.kind not in ('proof', 'comeback', 'pr') then return new; end if;
  if new.challenge_id is null or new.journey_id is null or new.media_asset_id is null then return new; end if;
  if new.proof_id is not null then return new; end if;

  select m.media_kind, m.public_url into media_kind, media_url
  from public.media_assets m
  where m.id = new.media_asset_id
    and m.processing_status = 'ready'
    and m.moderation_status = 'approved';
  if media_kind is null then return new; end if;

  legacy_type := case when media_kind = 'video' then 'video' else 'photo' end;
  receipt_date := (coalesce(new.published_at, now()) at time zone 'UTC')::date;

  insert into public.proofs (
    challenge_id, user_id, proof_type, media_url, caption, proof_date,
    post_id, journey_id, media_asset_id
  ) values (
    new.challenge_id, new.user_id, legacy_type, media_url, new.caption, receipt_date,
    new.id, new.journey_id, new.media_asset_id
  )
  on conflict (challenge_id, user_id, proof_date) do nothing
  returning id into receipt_id;

  if receipt_id is null then
    select p.id into receipt_id
    from public.proofs p
    where p.challenge_id = new.challenge_id
      and p.user_id = new.user_id
      and p.proof_date = receipt_date
      and p.journey_id = new.journey_id
    order by p.created_at asc, p.id asc
    limit 1;
  end if;

  if receipt_id is not null then
    update public.posts p
    set proof_id = receipt_id
    where p.id = new.id and p.proof_id is null;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_sync_published_proof_insert on public.posts;
create trigger posts_sync_published_proof_insert
after insert on public.posts
for each row execute function private.sync_published_post_proof_v1();

drop trigger if exists posts_sync_published_proof_update on public.posts;
create trigger posts_sync_published_proof_update
after update of status, moderation_status on public.posts
for each row execute function private.sync_published_post_proof_v1();

-- Blocking also severs Journey-follow relationships in either direction.
create or replace function private.set_block_v1(target_user uuid, should_block boolean)
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

    delete from public.journey_follows jf
    using public.journeys j
    where jf.journey_id = j.id
      and (
        (jf.follower_id = actor_id and j.user_id = target_user)
        or (jf.follower_id = target_user and j.user_id = actor_id)
      );
    return true;
  end if;

  delete from public.blocks b where b.blocker_id = actor_id and b.blocked_id = target_user;
  return false;
end;
$$;

create or replace function private.get_journey_snapshot_v1(target_journey uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not private.can_view_journey_v1(target_journey) then return null; end if;

  with journey as (
    select j.*, c.slug as challenge_slug, c.title as challenge_title,
           c.duration_days, c.visibility as challenge_visibility,
           pr.handle, pr.display_name, pr.avatar_url
    from public.journeys j
    join public.challenges c on c.id = j.challenge_id
    left join public.profiles pr on pr.id = j.user_id
    where j.id = target_journey
  ),
  metrics as (
    select * from private.journey_metrics_v1(target_journey)
  ),
  timeline as (
    select
      p.id as post_id,
      p.kind,
      p.caption,
      p.published_at,
      p.proof_id,
      m.media_kind,
      m.public_url as media_public_url,
      m.playback_id as media_playback_id,
      exists (
        select 1 from public.verifications v
        where v.proof_id = p.proof_id and v.verdict = true
      ) as proof_verified,
      (
        select v.verdict from public.verifications v
        where v.proof_id = p.proof_id and v.verifier_id = auth.uid()
        limit 1
      ) as viewer_verdict,
      (
        p.proof_id is not null
        and auth.uid() is not null
        and p.user_id <> auth.uid()
        and private.is_challenge_member(p.challenge_id)
        and not private.is_blocked_pair(auth.uid(), p.user_id)
      ) as viewer_can_verify
    from public.posts p
    left join public.media_assets m on m.id = p.media_asset_id
    where p.journey_id = target_journey
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and private.can_view_post(p.id)
    order by p.published_at asc, p.created_at asc, p.id asc
  )
  select jsonb_build_object(
    'id', j.id,
    'user_id', j.user_id,
    'display_name', coalesce(j.display_name, j.handle, 'PROVER'),
    'handle', j.handle,
    'avatar_url', j.avatar_url,
    'challenge_id', j.challenge_id,
    'challenge_slug', j.challenge_slug,
    'challenge_title', j.challenge_title,
    'attempt_no', j.attempt_no,
    'status', case when m.verified_count >= j.duration_days then 'completed' else j.status end,
    'started_at', j.started_at,
    'ended_at', j.ended_at,
    'verified_count', m.verified_count,
    'current_streak', case when j.status = 'active' then m.current_streak else 0 end,
    'best_streak', m.best_streak,
    'viewer_following', exists (
      select 1 from public.journey_follows jf
      where jf.journey_id = j.id and jf.follower_id = auth.uid()
    ),
    'viewer_is_owner', j.user_id = auth.uid(),
    'viewer_is_member', auth.uid() is not null and private.is_challenge_member(j.challenge_id),
    'timeline', coalesce((select jsonb_agg(to_jsonb(t) order by t.published_at asc, t.post_id asc) from timeline t), '[]'::jsonb)
  ) into result
  from journey j cross join metrics m;

  return result;
end;
$$;

create or replace function private.get_my_journey_for_drop_v1(target_challenge uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  journey_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select j.id into journey_id
  from public.journeys j
  where j.user_id = auth.uid()
    and j.challenge_id = target_challenge
    and j.status = 'active'
  order by j.attempt_no desc
  limit 1;
  if journey_id is null then return null; end if;
  return private.get_journey_snapshot_v1(journey_id);
end;
$$;

create or replace function private.get_profile_snapshot_v2(target_handle text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  with target as (
    select p.id, p.handle, p.display_name, p.avatar_url, p.plan
    from public.profiles p
    where p.handle = target_handle
      and not private.is_blocked_pair(auth.uid(), p.id)
    limit 1
  ),
  visible_journeys as (
    select j.*, c.title as challenge_title, c.slug as challenge_slug, c.duration_days,
           m.verified_count, m.current_streak, m.best_streak
    from public.journeys j
    join target t on t.id = j.user_id
    join public.challenges c on c.id = j.challenge_id
    cross join lateral private.journey_metrics_v1(j.id) m
    where auth.uid() = t.id or j.visibility = 'public'
  ),
  visible_proofs as (
    select pr.id,
           exists (select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true) as verified
    from public.proofs pr
    join target t on t.id = pr.user_id
    join public.challenges c on c.id = pr.challenge_id
    where auth.uid() = t.id or c.visibility = 'public'
  ),
  founders as (
    select count(*)::int as n
    from public.challenge_members cm
    join target t on t.id = cm.user_id
    join public.challenges c on c.id = cm.challenge_id
    where cm.founder = true and (auth.uid() = t.id or c.visibility = 'public')
  ),
  recruits as (
    select count(*)::int as n
    from public.invite_claims ic
    join target t on t.id = ic.inviter_id
    join public.challenges c on c.id = ic.challenge_id
    where auth.uid() = t.id or c.visibility = 'public'
  ),
  recent_posts as (
    select p.id as post_id, p.kind, p.caption, p.published_at, p.journey_id,
           c.title as challenge_title, c.slug as challenge_slug
    from public.posts p
    join target t on t.id = p.user_id
    left join public.challenges c on c.id = p.challenge_id
    where p.status = 'published'
      and p.moderation_status = 'approved'
      and p.visibility = 'public'
      and p.published_at is not null
      and p.published_at <= now()
    order by p.published_at desc, p.id desc
    limit 12
  ),
  comeback as (
    select count(*)::int as n
    from public.posts p
    join target t on t.id = p.user_id
    where p.kind = 'comeback'
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and p.visibility = 'public'
  ),
  completed as (
    select count(distinct vj.challenge_id)::int as n
    from visible_journeys vj
    where vj.verified_count >= vj.duration_days
  ),
  journey_list as (
    select vj.id, vj.challenge_id, vj.challenge_title, vj.challenge_slug,
           vj.attempt_no,
           case when vj.verified_count >= vj.duration_days then 'completed' else vj.status end as status,
           vj.started_at, vj.ended_at, vj.verified_count,
           case when vj.status = 'active' then vj.current_streak else 0 end as current_streak,
           vj.best_streak
    from visible_journeys vj
    order by vj.started_at desc, vj.attempt_no desc
    limit 12
  )
  select case when exists (select 1 from target) then jsonb_build_object(
    'receipts', (select count(*)::int from visible_proofs),
    'verified_receipts', (select count(*)::int from visible_proofs where verified),
    'founder_badges', (select n from founders),
    'recruits', (select n from recruits),
    'proof_score', (
      (select count(*)::int from visible_proofs where verified) * 10
      + (select count(*)::int from visible_proofs) * 2
      + (select n from recruits) * 5
    ),
    'completed_drops', (select n from completed),
    'current_streak', coalesce((select max(vj.current_streak)::int from visible_journeys vj where vj.status = 'active'), 0),
    'best_streak', coalesce((select max(vj.best_streak)::int from visible_journeys vj), 0),
    'comeback_count', (select n from comeback),
    'active_journeys', coalesce((select jsonb_agg(to_jsonb(jl) order by jl.started_at desc) from journey_list jl where jl.status in ('active','completed')), '[]'::jsonb),
    'journeys', coalesce((select jsonb_agg(to_jsonb(jl) order by jl.started_at desc) from journey_list jl), '[]'::jsonb),
    'trophy_case', coalesce((select jsonb_agg(to_jsonb(jl) order by jl.started_at desc) from journey_list jl where jl.status = 'completed'), '[]'::jsonb),
    'recent_posts', coalesce((select jsonb_agg(to_jsonb(rp) order by rp.published_at desc) from recent_posts rp), '[]'::jsonb)
  ) else null end into result;

  return result;
end;
$$;

-- Preserve old Journey timeline RPC as an invoker wrapper over its moved private implementation.
alter function public.get_journey_posts(uuid) set schema private;
revoke all on function private.get_journey_posts(uuid) from public, anon, authenticated;
grant execute on function private.get_journey_posts(uuid) to anon, authenticated;
create function public.get_journey_posts(target_journey uuid)
returns table (
  post_id uuid,
  kind text,
  caption text,
  published_at timestamptz,
  media_kind text,
  media_public_url text,
  media_playback_id text,
  user_id uuid,
  handle text,
  display_name text,
  challenge_id uuid,
  challenge_slug text,
  challenge_title text
) language sql stable security invoker set search_path = '' as $$
  select * from private.get_journey_posts(target_journey);
$$;

-- Replace the old public SECURITY DEFINER profile snapshot with an invoker wrapper.
drop function public.get_profile_snapshot(text);
create function public.get_profile_snapshot(target_handle text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_profile_snapshot_v2(target_handle);
$$;

create function public.ensure_journey_v1(target_challenge uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.ensure_journey_v1(target_challenge);
$$;
create function public.reset_journey_v1(target_challenge uuid, request_token text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.reset_journey_v1(target_challenge, request_token);
$$;
create function public.set_journey_follow_v1(target_journey uuid, should_follow boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.set_journey_follow_v1(target_journey, should_follow);
$$;
create function public.set_proof_verification_v1(target_proof uuid, target_verdict boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.set_proof_verification_v1(target_proof, target_verdict);
$$;
create function public.create_legacy_proof_v1(
  target_challenge uuid,
  target_media_url text,
  target_caption text default '',
  target_proof_type text default 'photo'
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_legacy_proof_v1(target_challenge, target_media_url, target_caption, target_proof_type);
$$;
create function public.get_journey_snapshot_v1(target_journey uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_journey_snapshot_v1(target_journey);
$$;
create function public.get_my_journey_for_drop_v1(target_challenge uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_my_journey_for_drop_v1(target_challenge);
$$;

-- Private implementations: explicit least privilege for wrappers only.
revoke all on function private.ensure_journey_v1(uuid) from public, anon, authenticated;
revoke all on function private.reset_journey_v1(uuid, text) from public, anon, authenticated;
revoke all on function private.set_journey_follow_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function private.set_proof_verification_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function private.create_legacy_proof_v1(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.get_journey_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function private.get_my_journey_for_drop_v1(uuid) from public, anon, authenticated;
revoke all on function private.get_profile_snapshot_v2(text) from public, anon, authenticated;

grant execute on function private.ensure_journey_v1(uuid) to authenticated;
grant execute on function private.reset_journey_v1(uuid, text) to authenticated;
grant execute on function private.set_journey_follow_v1(uuid, boolean) to authenticated;
grant execute on function private.set_proof_verification_v1(uuid, boolean) to authenticated;
grant execute on function private.create_legacy_proof_v1(uuid, text, text, text) to authenticated;
grant execute on function private.get_journey_snapshot_v1(uuid) to anon, authenticated;
grant execute on function private.get_my_journey_for_drop_v1(uuid) to authenticated;
grant execute on function private.get_profile_snapshot_v2(text) to anon, authenticated;

-- Public wrapper ACLs.
revoke all on function public.ensure_journey_v1(uuid) from public, anon, authenticated;
revoke all on function public.reset_journey_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.set_journey_follow_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_proof_verification_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_legacy_proof_v1(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.get_journey_snapshot_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_my_journey_for_drop_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_profile_snapshot(text) from public, anon, authenticated;
revoke all on function public.get_journey_posts(uuid) from public, anon, authenticated;

grant execute on function public.ensure_journey_v1(uuid) to authenticated;
grant execute on function public.reset_journey_v1(uuid, text) to authenticated;
grant execute on function public.set_journey_follow_v1(uuid, boolean) to authenticated;
grant execute on function public.set_proof_verification_v1(uuid, boolean) to authenticated;
grant execute on function public.create_legacy_proof_v1(uuid, text, text, text) to authenticated;
grant execute on function public.get_journey_snapshot_v1(uuid) to anon, authenticated;
grant execute on function public.get_my_journey_for_drop_v1(uuid) to authenticated;
grant execute on function public.get_profile_snapshot(text) to anon, authenticated;
grant execute on function public.get_journey_posts(uuid) to anon, authenticated;
