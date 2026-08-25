-- Stage 11 notification hardening.
-- Keep delivery convenience state isolated from credibility/product state while tightening ownership and visibility checks.

create or replace function private.notification_timezone_v1(target_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.notification_preferences np
      join pg_catalog.pg_timezone_names z on z.name = np.timezone
      where np.user_id = target_user
    ) then (
      select np.timezone
      from public.notification_preferences np
      where np.user_id = target_user
    )
    else 'UTC'
  end;
$$;

create or replace function private.notification_route_visible_v1(
  target_user uuid,
  target_route text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  route_type text;
  route_value text;
  target_uuid uuid;
begin
  if target_user is null or not private.notification_route_allowed_v1(target_route) then
    return false;
  end if;

  route_type := split_part(target_route, '/', 2);
  route_value := split_part(target_route, '/', 3);

  if route_type in ('p', 'r', 'j') then
    begin
      target_uuid := route_value::uuid;
    exception when others then
      return false;
    end;
  end if;

  case route_type
    when 'p' then
      return exists (
        select 1
        from public.posts p
        where p.id = target_uuid
          and p.status = 'published'
          and p.moderation_status = 'approved'
          and p.published_at is not null
          and p.published_at <= now()
          and not private.is_blocked_pair(target_user, p.user_id)
          and (
            p.user_id = target_user
            or p.visibility = 'public'
            or (
              p.visibility = 'crew'
              and p.challenge_id is not null
              and exists (
                select 1 from public.challenge_members cm
                where cm.challenge_id = p.challenge_id and cm.user_id = target_user
              )
            )
          )
      );
    when 'r' then
      return exists (
        select 1
        from public.proofs pr
        join public.challenges c on c.id = pr.challenge_id
        where pr.id = target_uuid
          and c.visibility = 'public'
          and not private.is_blocked_pair(target_user, pr.user_id)
      );
    when 'j' then
      return exists (
        select 1
        from public.journeys j
        where j.id = target_uuid
          and not private.is_blocked_pair(target_user, j.user_id)
          and (
            j.user_id = target_user
            or j.visibility = 'public'
            or (
              j.visibility = 'crew'
              and exists (
                select 1 from public.challenge_members cm
                where cm.challenge_id = j.challenge_id and cm.user_id = target_user
              )
            )
          )
      );
    when 'c' then
      return exists (
        select 1
        from public.challenges c
        where c.slug = route_value
          and (
            c.visibility = 'public'
            or c.owner_id = target_user
            or exists (
              select 1 from public.challenge_members cm
              where cm.challenge_id = c.id and cm.user_id = target_user
            )
          )
      );
    when 'u' then
      return exists (
        select 1
        from public.profiles p
        where p.handle = route_value
          and (p.id = target_user or not private.is_blocked_pair(target_user, p.id))
      );
    when 'invite' then
      return exists (
        select 1
        from public.invites i
        where i.code = route_value
          and not private.is_blocked_pair(target_user, i.inviter_id)
      );
    else
      return false;
  end case;
end;
$$;

-- An enabled device token is owned by one account at a time. A disabled token may
-- be transferred after explicit logout/disable or provider invalidation.
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
    where public.push_tokens.user_id = actor_id
       or public.push_tokens.enabled = false
  returning id into token_id;

  if token_id is null then
    raise exception 'push token already registered';
  end if;

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

-- Relationship events use entity-stable keys so toggling a relationship cannot spam the recipient.
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
      'follow:' || new.follower_id::text || ':' || new.followed_id::text,
      'New follower',
      'Someone new is following your ProofMode journey.',
      '/u/' || actor_handle
    );
  end if;
  return new;
end;
$$;

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
      'reaction:' || new.post_id::text || ':' || new.user_id::text,
      'New reaction',
      'Someone reacted to your ProofMode post.',
      '/p/' || new.post_id::text
    );
  end if;
  return new;
end;
$$;

-- Re-evaluate scheduled stakes with the recipient's local calendar date instead of
-- the database session date so UTC boundaries cannot create a false streak warning.
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

  for candidate in
    select j.id as journey_id,
           j.user_id,
           (reference_time at time zone private.notification_timezone_v1(j.user_id))::date as local_date
    from public.journeys j
    where j.status = 'active'
      and extract(hour from reference_time at time zone private.notification_timezone_v1(j.user_id)) between 17 and 21
      and exists (
        select 1 from public.proofs pr
        where pr.journey_id = j.id
          and pr.proof_date = (reference_time at time zone private.notification_timezone_v1(j.user_id))::date - 1
          and exists (select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true)
      )
      and not exists (
        select 1 from public.proofs pr
        where pr.journey_id = j.id
          and pr.proof_date = (reference_time at time zone private.notification_timezone_v1(j.user_id))::date
          and exists (select 1 from public.verifications v where v.proof_id = pr.id and v.verdict = true)
      )
  loop
    queued := private.enqueue_push_v1(
      candidate.user_id, null, 'streak_risk',
      'streak-risk:' || candidate.journey_id::text || ':' || candidate.local_date::text,
      'Your streak is at risk',
      'One verified proof keeps this Journey moving.',
      '/j/' || candidate.journey_id::text,
      reference_time
    );
    if queued is not null then queued_count := queued_count + 1; end if;
  end loop;

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
    select r.challenge_id,
           r.user_id,
           c.slug,
           (reference_time at time zone private.notification_timezone_v1(r.user_id))::date as local_date
    from ranked r
    join public.challenges c on c.id = r.challenge_id
    where r.ahead_verified = r.verified_count + 1
      and extract(hour from reference_time at time zone private.notification_timezone_v1(r.user_id)) between 12 and 20
  loop
    queued := private.enqueue_push_v1(
      candidate.user_id, null, 'crew_position',
      'crew-position:' || candidate.challenge_id::text || ':' || candidate.local_date::text,
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

-- Delivery is a second authorization point: content may have been removed, hidden,
-- or made inaccessible after the event was originally queued.
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
  if not private.notification_route_visible_v1(recipient, target_route) then
    return jsonb_build_object('allowed', false, 'reason', 'route_hidden');
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

revoke all on function private.notification_timezone_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function private.notification_route_visible_v1(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.register_push_token_v1(text, text) from public, anon, authenticated, service_role;
revoke all on function private.notify_follow_insert_v1() from public, anon, authenticated, service_role;
revoke all on function private.notify_reaction_change_v1() from public, anon, authenticated, service_role;
revoke all on function private.enqueue_due_notification_stakes_v1(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.get_push_job_delivery_v1(bigint) from public, anon, authenticated, service_role;

grant execute on function private.register_push_token_v1(text, text) to authenticated;
grant execute on function private.enqueue_due_notification_stakes_v1(timestamptz) to service_role;
grant execute on function private.get_push_job_delivery_v1(bigint) to service_role;
