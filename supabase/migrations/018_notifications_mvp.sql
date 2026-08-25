-- Stage 11 Notifications MVP.
-- Reuse push_tokens, notification_preferences, and job_outbox; keep delivery state non-authoritative.

alter table public.push_tokens
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 120),
  add column if not exists last_error text check (last_error is null or char_length(last_error) <= 500);

alter table public.notification_preferences
  add column if not exists timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 64);

-- Recap remains explicitly P1 in Stage 11.
update public.notification_preferences set recap = false where recap = true;

create table if not exists public.push_deliveries (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.job_outbox(id) on delete cascade,
  token_id uuid not null references public.push_tokens(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  expo_ticket_id text,
  status text not null default 'pending'
    check (status in ('pending','ticket_ok','ticket_error','delivered','failed','disabled')),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  attempt_count int not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  receipt_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, token_id)
);

create index if not exists push_tokens_user_enabled_idx
  on public.push_tokens(user_id, enabled, last_seen_at desc, id);
create index if not exists push_deliveries_ticket_idx
  on public.push_deliveries(status, sent_at, id)
  where status = 'ticket_ok';
create index if not exists push_deliveries_token_idx
  on public.push_deliveries(token_id, created_at desc);
create index if not exists push_deliveries_recipient_idx
  on public.push_deliveries(recipient_id, created_at desc);
create index if not exists job_outbox_push_recipient_created_idx
  on public.job_outbox ((payload ->> 'recipient_id'), created_at desc)
  where kind = 'push';

alter table public.push_deliveries enable row level security;

-- Token/preference mutation is RPC-owned; delivery rows are service-only.
drop policy if exists "users manage own push tokens" on public.push_tokens;
drop policy if exists "users read own notification prefs" on public.notification_preferences;
drop policy if exists "users create own notification prefs" on public.notification_preferences;
drop policy if exists "users update own notification prefs" on public.notification_preferences;

revoke all on table public.push_tokens from anon, authenticated;
revoke all on table public.notification_preferences from anon, authenticated;
revoke all on table public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.push_tokens to service_role;
grant select, insert, update, delete on table public.notification_preferences to service_role;
grant select, insert, update, delete on table public.push_deliveries to service_role;
grant usage, select on sequence public.push_deliveries_id_seq to service_role;

create or replace function private.notification_route_allowed_v1(target_route text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(target_route, '') ~ '^/(p|r|j)/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$'
      or coalesce(target_route, '') ~ '^/c/[a-z0-9][a-z0-9-]{0,79}$'
      or coalesce(target_route, '') ~ '^/u/[A-Za-z0-9_][A-Za-z0-9_-]{0,39}$'
      or coalesce(target_route, '') ~ '^/invite/[A-Za-z0-9_-]{8,64}$';
$$;

create or replace function private.notification_pref_enabled_v1(
  target_user uuid,
  target_class text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case target_class
      when 'social' then np.social
      when 'drop_updates' then np.drop_updates
      when 'streak_risk' then np.streak_risk
      when 'crew_position' then np.crew_position
      when 'journey_updates' then np.journey_updates
      when 'invites' then np.invites
      when 'recap' then false
      else false
    end
    from public.notification_preferences np
    where np.user_id = target_user
  ), target_class in ('social','drop_updates','streak_risk','crew_position','journey_updates','invites'));
$$;

create or replace function private.notification_run_after_v1(
  target_user uuid,
  reference_time timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  quiet_start time;
  quiet_end time;
  target_timezone text;
  local_now timestamp;
  local_time time;
  local_date date;
  resume_local timestamp;
begin
  select np.quiet_hours_start, np.quiet_hours_end, np.timezone
    into quiet_start, quiet_end, target_timezone
  from public.notification_preferences np
  where np.user_id = target_user;

  if quiet_start is null or quiet_end is null or quiet_start = quiet_end then
    return reference_time;
  end if;

  target_timezone := coalesce(target_timezone, 'UTC');
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = target_timezone) then
    target_timezone := 'UTC';
  end if;

  local_now := reference_time at time zone target_timezone;
  local_time := local_now::time;
  local_date := local_now::date;

  if quiet_start < quiet_end then
    if local_time >= quiet_start and local_time < quiet_end then
      resume_local := local_date + quiet_end;
      return resume_local at time zone target_timezone;
    end if;
    return reference_time;
  end if;

  if local_time >= quiet_start then
    resume_local := (local_date + 1) + quiet_end;
    return resume_local at time zone target_timezone;
  end if;
  if local_time < quiet_end then
    resume_local := local_date + quiet_end;
    return resume_local at time zone target_timezone;
  end if;
  return reference_time;
end;
$$;

create or replace function private.notification_budget_allows_v1(
  target_user uuid,
  reference_time timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.job_outbox j
      where j.kind = 'push'
        and j.payload ->> 'recipient_id' = target_user::text
        and j.created_at >= reference_time - interval '1 hour'
        and j.status <> 'dead') < 4
    and
    (select count(*) from public.job_outbox j
      where j.kind = 'push'
        and j.payload ->> 'recipient_id' = target_user::text
        and j.created_at >= reference_time - interval '24 hours'
        and j.status <> 'dead') < 12;
$$;

create or replace function private.enqueue_push_v1(
  target_recipient uuid,
  target_actor uuid,
  target_class text,
  target_event_key text,
  target_title text,
  target_body text,
  target_route text,
  reference_time timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_event_key text := btrim(coalesce(target_event_key, ''));
  clean_title text := left(btrim(coalesce(target_title, '')), 80);
  clean_body text := left(btrim(coalesce(target_body, '')), 180);
  run_at timestamptz;
  dedupe text;
  queued_id bigint;
begin
  if target_recipient is null then return null; end if;
  if target_actor is not null and target_actor = target_recipient then return null; end if;
  if target_class not in ('social','drop_updates','streak_risk','crew_position','journey_updates','invites') then return null; end if;
  if char_length(clean_event_key) < 1 or char_length(clean_event_key) > 240 then return null; end if;
  if char_length(clean_title) < 1 or char_length(clean_body) < 1 then return null; end if;
  if not private.notification_route_allowed_v1(target_route) then return null; end if;
  if target_actor is not null and private.is_blocked_pair(target_recipient, target_actor) then return null; end if;
  if not private.notification_pref_enabled_v1(target_recipient, target_class) then return null; end if;
  if not exists (
    select 1 from public.push_tokens pt
    where pt.user_id = target_recipient and pt.enabled = true
  ) then return null; end if;
  if not private.notification_budget_allows_v1(target_recipient, reference_time) then return null; end if;

  run_at := private.notification_run_after_v1(target_recipient, reference_time);
  dedupe := 'push:' || target_recipient::text || ':' || md5(clean_event_key);

  insert into public.job_outbox (kind, payload, dedupe_key, status, run_after)
  values (
    'push',
    jsonb_build_object(
      'recipient_id', target_recipient,
      'actor_id', target_actor,
      'class', target_class,
      'event_key', clean_event_key,
      'title', clean_title,
      'body', clean_body,
      'route', target_route
    ),
    dedupe,
    'pending',
    run_at
  )
  on conflict (dedupe_key) do nothing
  returning id into queued_id;

  if queued_id is null then
    select j.id into queued_id from public.job_outbox j where j.dedupe_key = dedupe;
  end if;
  return queued_id;
end;
$$;

create or replace function private.register_push_token_v1(
  target_token text,
  target_platform text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_token text := btrim(coalesce(target_token, ''));
  token_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if target_platform not in ('ios','android') then raise exception 'invalid push platform'; end if;
  if char_length(clean_token) < 20 or char_length(clean_token) > 256
     or clean_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid Expo push token';
  end if;

  insert into public.push_tokens (
    user_id, platform, token, enabled, last_seen_at, updated_at,
    disabled_at, disabled_reason, last_error
  ) values (
    actor_id, target_platform, clean_token, true, now(), now(), null, null, null
  )
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        enabled = true,
        last_seen_at = now(),
        updated_at = now(),
        disabled_at = null,
        disabled_reason = null,
        last_error = null
  returning id into token_id;

  -- Keep the active-device set bounded without preventing normal multi-device use.
  update public.push_tokens pt
  set enabled = false,
      disabled_at = now(),
      disabled_reason = 'device_limit',
      updated_at = now()
  where pt.id in (
    select ranked.id
    from (
      select p.id, row_number() over (order by p.last_seen_at desc, p.id desc) as rn
      from public.push_tokens p
      where p.user_id = actor_id and p.enabled = true
    ) ranked
    where ranked.rn > 10
  );

  return token_id;
end;
$$;

create or replace function private.disable_push_token_v1(target_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  update public.push_tokens pt
  set enabled = false,
      disabled_at = now(),
      disabled_reason = 'user_disabled',
      updated_at = now()
  where pt.user_id = actor_id and pt.token = btrim(coalesce(target_token, ''));
  return found;
end;
$$;

create or replace function private.get_notification_preferences_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  insert into public.notification_preferences (user_id, recap)
  values (actor_id, false)
  on conflict (user_id) do nothing;

  select jsonb_build_object(
    'social', np.social,
    'drop_updates', np.drop_updates,
    'streak_risk', np.streak_risk,
    'crew_position', np.crew_position,
    'journey_updates', np.journey_updates,
    'invites', np.invites,
    'recap', false,
    'quiet_hours_start', np.quiet_hours_start,
    'quiet_hours_end', np.quiet_hours_end,
    'timezone', np.timezone
  ) into result
  from public.notification_preferences np
  where np.user_id = actor_id;
  return result;
end;
$$;

create or replace function private.set_notification_preferences_v1(
  target_social boolean,
  target_drop_updates boolean,
  target_streak_risk boolean,
  target_crew_position boolean,
  target_journey_updates boolean,
  target_invites boolean,
  target_quiet_hours_start time default null,
  target_quiet_hours_end time default null,
  target_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clean_timezone text := btrim(coalesce(target_timezone, 'UTC'));
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if target_social is null or target_drop_updates is null or target_streak_risk is null
     or target_crew_position is null or target_journey_updates is null or target_invites is null then
    raise exception 'notification preferences require explicit booleans';
  end if;
  if (target_quiet_hours_start is null) <> (target_quiet_hours_end is null) then
    raise exception 'quiet hours require both start and end';
  end if;
  if char_length(clean_timezone) < 1 or char_length(clean_timezone) > 64
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = clean_timezone) then
    raise exception 'invalid notification timezone';
  end if;

  insert into public.notification_preferences (
    user_id, social, drop_updates, streak_risk, crew_position, journey_updates,
    invites, recap, quiet_hours_start, quiet_hours_end, timezone, updated_at
  ) values (
    actor_id, target_social, target_drop_updates, target_streak_risk, target_crew_position,
    target_journey_updates, target_invites, false, target_quiet_hours_start,
    target_quiet_hours_end, clean_timezone, now()
  )
  on conflict (user_id) do update
    set social = excluded.social,
        drop_updates = excluded.drop_updates,
        streak_risk = excluded.streak_risk,
        crew_position = excluded.crew_position,
        journey_updates = excluded.journey_updates,
        invites = excluded.invites,
        recap = false,
        quiet_hours_start = excluded.quiet_hours_start,
        quiet_hours_end = excluded.quiet_hours_end,
        timezone = excluded.timezone,
        updated_at = now();

  return private.get_notification_preferences_v1();
end;
$$;

-- Social event triggers enqueue generic, privacy-safe messages only.
create or replace function private.notify_follow_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_handle text;
begin
  select p.handle into actor_handle from public.profiles p where p.id = new.follower_id;
  if actor_handle is not null then
    perform private.enqueue_push_v1(
      new.followed_id,
      new.follower_id,
      'social',
      'follow:' || new.follower_id::text || ':' || new.created_at::text,
      'New follower',
      'Someone new is following your ProofMode journey.',
      '/u/' || actor_handle
    );
  end if;
  return new;
end;
$$;

drop trigger if exists follows_notify_insert on public.follows;
create trigger follows_notify_insert
after insert on public.follows
for each row execute function private.notify_follow_insert_v1();

create or replace function private.notify_reaction_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  visible boolean;
begin
  select p.user_id,
         p.status = 'published' and p.moderation_status = 'approved'
           and p.published_at is not null and p.published_at <= now()
    into recipient, visible
  from public.posts p where p.id = new.post_id;
  if coalesce(visible, false) then
    perform private.enqueue_push_v1(
      recipient,
      new.user_id,
      'social',
      'reaction:' || new.post_id::text || ':' || new.user_id::text || ':' || new.created_at::text,
      'New reaction',
      'Someone reacted to your ProofMode post.',
      '/p/' || new.post_id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists post_reactions_notify_insert on public.post_reactions;
drop trigger if exists post_reactions_notify_update on public.post_reactions;
create trigger post_reactions_notify_insert
after insert on public.post_reactions
for each row execute function private.notify_reaction_change_v1();
create trigger post_reactions_notify_update
after update of reaction on public.post_reactions
for each row
when (old.reaction is distinct from new.reaction)
execute function private.notify_reaction_change_v1();

create or replace function private.notify_comment_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  visible boolean;
begin
  select p.user_id,
         p.status = 'published' and p.moderation_status = 'approved'
           and p.published_at is not null and p.published_at <= now()
    into recipient, visible
  from public.posts p where p.id = new.post_id;
  if coalesce(visible, false) then
    perform private.enqueue_push_v1(
      recipient,
      new.user_id,
      'social',
      'comment:' || new.id::text,
      'New comment',
      'Someone commented on your ProofMode post.',
      '/p/' || new.post_id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists comments_notify_insert on public.comments;
create trigger comments_notify_insert
after insert on public.comments
for each row execute function private.notify_comment_insert_v1();

create or replace function private.notify_invite_claim_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_slug text;
begin
  select c.slug into challenge_slug from public.challenges c where c.id = new.challenge_id;
  if challenge_slug is not null then
    perform private.enqueue_push_v1(
      new.inviter_id,
      new.referred_user_id,
      'invites',
      'invite-claim:' || new.id::text,
      'Invite accepted',
      'Someone joined through your ProofMode invite.',
      '/c/' || challenge_slug
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invite_claims_notify_insert on public.invite_claims;
create trigger invite_claims_notify_insert
after insert on public.invite_claims
for each row execute function private.notify_invite_claim_insert_v1();

create or replace function private.notify_journey_post_published_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  follower record;
begin
  if new.journey_id is null or new.status <> 'published' or new.moderation_status <> 'approved'
     or new.published_at is null or new.published_at > now() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' and old.moderation_status = 'approved' then
    return new;
  end if;

  for follower in
    select jf.follower_id
    from public.journey_follows jf
    where jf.journey_id = new.journey_id
  loop
    perform private.enqueue_push_v1(
      follower.follower_id,
      new.user_id,
      'journey_updates',
      'journey-post:' || new.id::text,
      'Journey update',
      'A Journey you follow has a new chapter.',
      '/j/' || new.journey_id::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists posts_notify_journey_insert on public.posts;
drop trigger if exists posts_notify_journey_update on public.posts;
create trigger posts_notify_journey_insert
after insert on public.posts
for each row execute function private.notify_journey_post_published_v1();
create trigger posts_notify_journey_update
after update of status, moderation_status, published_at on public.posts
for each row execute function private.notify_journey_post_published_v1();

-- Service-only scheduled stake evaluation: Drop start/end, streak risk, Crew position.
create or replace function private.enqueue_due_notification_stakes_v1(
  reference_time timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  queued bigint;
  queued_count int := 0;
begin
  -- Drop start notifications for members and watchers. A two-hour lookback avoids stale blasts.
  for candidate in
    select distinct c.id as challenge_id, c.slug, people.user_id
    from public.challenges c
    join lateral (
      select cm.user_id from public.challenge_members cm where cm.challenge_id = c.id
      union
      select wc.user_id from public.watched_challenges wc where wc.challenge_id = c.id
    ) people on true
    where c.format = 'drop'
      and c.launch_at is not null
      and c.launch_at <= reference_time
      and c.launch_at > reference_time - interval '2 hours'
  loop
    queued := private.enqueue_push_v1(
      candidate.user_id, null, 'drop_updates',
      'drop-start:' || candidate.challenge_id::text,
      'Your Drop is starting',
      'A Drop you joined or watch is starting now.',
      '/c/' || candidate.slug,
      reference_time
    );
    if queued is not null then queued_count := queued_count + 1; end if;
  end loop;

  -- Drop end notifications use launch time + duration and the same relationship set.
  for candidate in
    select distinct c.id as challenge_id, c.slug, people.user_id
    from public.challenges c
    join lateral (
      select cm.user_id from public.challenge_members cm where cm.challenge_id = c.id
      union
      select wc.user_id from public.watched_challenges wc where wc.challenge_id = c.id
    ) people on true
    where c.format = 'drop'
      and c.launch_at is not null
      and c.launch_at + (c.duration_days * interval '1 day') <= reference_time
      and c.launch_at + (c.duration_days * interval '1 day') > reference_time - interval '2 hours'
  loop
    queued := private.enqueue_push_v1(
      candidate.user_id, null, 'drop_updates',
      'drop-end:' || candidate.challenge_id::text,
      'Your Drop just ended',
      'Open ProofMode to see how the Drop finished.',
      '/c/' || candidate.slug,
      reference_time
    );
    if queued is not null then queued_count := queued_count + 1; end if;
  end loop;

  -- Streak-risk notification only after 17:00 local time and only when yesterday is the latest verified day.
  for candidate in
    select j.id as journey_id, j.user_id
    from public.journeys j
    left join public.notification_preferences np on np.user_id = j.user_id
    where j.status = 'active'
      and extract(hour from reference_time at time zone coalesce(np.timezone, 'UTC')) between 17 and 21
      and exists (
        select 1 from public.proofs pr
        where pr.journey_id = j.id
          and pr.proof_date = current_date - 1
          and exists (select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true)
      )
      and not exists (
        select 1 from public.proofs pr
        where pr.journey_id = j.id
          and pr.proof_date = current_date
          and exists (select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true)
      )
  loop
    queued := private.enqueue_push_v1(
      candidate.user_id, null, 'streak_risk',
      'streak-risk:' || candidate.journey_id::text || ':' || current_date::text,
      'Your streak is at risk',
      'One verified proof keeps this Journey moving.',
      '/j/' || candidate.journey_id::text,
      reference_time
    );
    if queued is not null then queued_count := queued_count + 1; end if;
  end loop;

  -- Crew position only when the member is exactly one verified proof behind the next rank.
  for candidate in
    with verified as (
      select cm.challenge_id, cm.user_id, cm.joined_at,
             count(pr.id) filter (where exists (
               select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true
             ))::int as verified_count
      from public.challenge_members cm
      join public.challenges c on c.id = cm.challenge_id and c.format = 'crew'
      left join public.proofs pr on pr.challenge_id = cm.challenge_id and pr.user_id = cm.user_id
      group by cm.challenge_id, cm.user_id, cm.joined_at
    ), ranked as (
      select v.*,
             lag(v.verified_count) over (
               partition by v.challenge_id
               order by v.verified_count desc, v.joined_at asc, v.user_id
             ) as ahead_verified
      from verified v
    )
    select r.challenge_id, r.user_id, c.slug
    from ranked r
    join public.challenges c on c.id = r.challenge_id
    left join public.notification_preferences np on np.user_id = r.user_id
    where r.ahead_verified = r.verified_count + 1
      and extract(hour from reference_time at time zone coalesce(np.timezone, 'UTC')) between 12 and 20
  loop
    queued := private.enqueue_push_v1(
      candidate.user_id, null, 'crew_position',
      'crew-position:' || candidate.challenge_id::text || ':' || current_date::text,
      'One proof can move you up',
      'You are one verified proof from the next Crew position.',
      '/c/' || candidate.slug,
      reference_time
    );
    if queued is not null then queued_count := queued_count + 1; end if;
  end loop;

  return queued_count;
end;
$$;

create or replace function private.claim_push_jobs_v1(max_items int default 50)
returns table (job_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_outbox j
  set status = 'failed', locked_at = null, run_after = now(), updated_at = now(),
      last_error = coalesce(j.last_error, 'stale push claim recovered')
  where j.kind = 'push'
    and j.status = 'running'
    and j.locked_at < now() - interval '10 minutes'
    and j.attempts < 5;

  update public.job_outbox j
  set status = 'dead', locked_at = null, updated_at = now()
  where j.kind = 'push'
    and j.status in ('failed','running')
    and j.attempts >= 5;

  return query
  with candidates as (
    select j.id
    from public.job_outbox j
    where j.kind = 'push'
      and j.status in ('pending','failed')
      and j.run_after <= now()
      and j.attempts < 5
    order by j.run_after asc, j.id asc
    for update skip locked
    limit greatest(1, least(max_items, 100))
  )
  update public.job_outbox j
  set status = 'running', attempts = j.attempts + 1, locked_at = now(), updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.id;
end;
$$;

create or replace function private.get_push_job_delivery_v1(target_job bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  job_payload jsonb;
  recipient uuid;
  actor uuid;
  notification_class text;
  target_route text;
  defer_until timestamptz;
  token_rows jsonb;
begin
  select j.payload into job_payload
  from public.job_outbox j
  where j.id = target_job and j.kind = 'push' and j.status = 'running';
  if job_payload is null then return null; end if;

  begin
    recipient := (job_payload ->> 'recipient_id')::uuid;
    actor := nullif(job_payload ->> 'actor_id', '')::uuid;
  exception when others then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_payload');
  end;
  notification_class := job_payload ->> 'class';
  target_route := job_payload ->> 'route';

  if recipient is null or not private.notification_route_allowed_v1(target_route) then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_payload');
  end if;
  if actor is not null and (actor = recipient or private.is_blocked_pair(recipient, actor)) then
    return jsonb_build_object('allowed', false, 'reason', 'blocked');
  end if;
  if not private.notification_pref_enabled_v1(recipient, notification_class) then
    return jsonb_build_object('allowed', false, 'reason', 'preference');
  end if;

  defer_until := private.notification_run_after_v1(recipient, now());
  if defer_until > now() + interval '1 second' then
    return jsonb_build_object('allowed', false, 'reason', 'quiet_hours', 'defer_until', defer_until);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', pt.id, 'token', pt.token) order by pt.last_seen_at desc), '[]'::jsonb)
    into token_rows
  from public.push_tokens pt
  where pt.user_id = recipient and pt.enabled = true;

  return jsonb_build_object(
    'allowed', jsonb_array_length(token_rows) > 0,
    'reason', case when jsonb_array_length(token_rows) > 0 then null else 'no_tokens' end,
    'recipient_id', recipient,
    'class', notification_class,
    'title', left(coalesce(job_payload ->> 'title', ''), 80),
    'body', left(coalesce(job_payload ->> 'body', ''), 180),
    'route', target_route,
    'tokens', token_rows
  );
end;
$$;

-- User-facing public wrappers stay invoker; privileged implementations remain private.
create or replace function public.register_push_token_v1(target_token text, target_platform text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.register_push_token_v1(target_token, target_platform); $$;

create or replace function public.disable_push_token_v1(target_token text)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.disable_push_token_v1(target_token); $$;

create or replace function public.get_notification_preferences_v1()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.get_notification_preferences_v1(); $$;

create or replace function public.set_notification_preferences_v1(
  target_social boolean,
  target_drop_updates boolean,
  target_streak_risk boolean,
  target_crew_position boolean,
  target_journey_updates boolean,
  target_invites boolean,
  target_quiet_hours_start time default null,
  target_quiet_hours_end time default null,
  target_timezone text default 'UTC'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_notification_preferences_v1(
    target_social, target_drop_updates, target_streak_risk, target_crew_position,
    target_journey_updates, target_invites, target_quiet_hours_start,
    target_quiet_hours_end, target_timezone
  );
$$;

-- Service-role wrappers support the delivery worker without exposing private schema through Data API.
create or replace function public.enqueue_due_notification_stakes_v1(reference_time timestamptz default now())
returns int
language sql
security invoker
set search_path = ''
as $$ select private.enqueue_due_notification_stakes_v1(reference_time); $$;

create or replace function public.claim_push_jobs_v1(max_items int default 50)
returns table (job_id bigint)
language sql
security invoker
set search_path = ''
as $$ select * from private.claim_push_jobs_v1(max_items); $$;

create or replace function public.get_push_job_delivery_v1(target_job bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_push_job_delivery_v1(target_job); $$;

revoke all on function private.notification_route_allowed_v1(text) from public, anon, authenticated, service_role;
revoke all on function private.notification_pref_enabled_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.notification_run_after_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.notification_budget_allows_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_push_v1(uuid, uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.register_push_token_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function private.disable_push_token_v1(text) from public, anon, authenticated, service_role;
revoke all on function private.get_notification_preferences_v1() from public, anon, authenticated, service_role;
revoke all on function private.set_notification_preferences_v1(boolean, boolean, boolean, boolean, boolean, boolean, time, time, text) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_due_notification_stakes_v1(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.claim_push_jobs_v1(int) from public, anon, authenticated, service_role;
revoke all on function private.get_push_job_delivery_v1(bigint) from public, anon, authenticated, service_role;

grant execute on function private.register_push_token_v1(text, text) to authenticated;
grant execute on function private.disable_push_token_v1(text) to authenticated;
grant execute on function private.get_notification_preferences_v1() to authenticated;
grant execute on function private.set_notification_preferences_v1(boolean, boolean, boolean, boolean, boolean, boolean, time, time, text) to authenticated;
grant execute on function private.enqueue_due_notification_stakes_v1(timestamptz) to service_role;
grant execute on function private.claim_push_jobs_v1(int) to service_role;
grant execute on function private.get_push_job_delivery_v1(bigint) to service_role;

revoke all on function public.register_push_token_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function public.disable_push_token_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.get_notification_preferences_v1() from public, anon, authenticated, service_role;
revoke all on function public.set_notification_preferences_v1(boolean, boolean, boolean, boolean, boolean, boolean, time, time, text) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_due_notification_stakes_v1(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.claim_push_jobs_v1(int) from public, anon, authenticated, service_role;
revoke all on function public.get_push_job_delivery_v1(bigint) from public, anon, authenticated, service_role;

grant execute on function public.register_push_token_v1(text, text) to authenticated;
grant execute on function public.disable_push_token_v1(text) to authenticated;
grant execute on function public.get_notification_preferences_v1() to authenticated;
grant execute on function public.set_notification_preferences_v1(boolean, boolean, boolean, boolean, boolean, boolean, time, time, text) to authenticated;
grant execute on function public.enqueue_due_notification_stakes_v1(timestamptz) to service_role;
grant execute on function public.claim_push_jobs_v1(int) to service_role;
grant execute on function public.get_push_job_delivery_v1(bigint) to service_role;

revoke all on function private.notify_follow_insert_v1() from public, anon, authenticated, service_role;
revoke all on function private.notify_reaction_change_v1() from public, anon, authenticated, service_role;
revoke all on function private.notify_comment_insert_v1() from public, anon, authenticated, service_role;
revoke all on function private.notify_invite_claim_insert_v1() from public, anon, authenticated, service_role;
revoke all on function private.notify_journey_post_published_v1() from public, anon, authenticated, service_role;
