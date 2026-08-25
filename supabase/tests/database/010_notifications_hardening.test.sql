begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id,email,raw_user_meta_data) values
 ('19000000-0000-0000-0000-000000000001','notify-hard-a@example.test','{"name":"Notify Hard A"}'::jsonb),
 ('19000000-0000-0000-0000-000000000002','notify-hard-b@example.test','{"name":"Notify Hard B"}'::jsonb),
 ('19000000-0000-0000-0000-000000000003','notify-hard-c@example.test','{"name":"Notify Hard C"}'::jsonb);

update public.profiles set handle='notify-hard-a', display_name='Notify Hard A' where id='19000000-0000-0000-0000-000000000001';
update public.profiles set handle='notify-hard-b', display_name='Notify Hard B' where id='19000000-0000-0000-0000-000000000002';
update public.profiles set handle='notify-hard-c', display_name='Notify Hard C' where id='19000000-0000-0000-0000-000000000003';

insert into public.challenges (
  id,owner_id,title,slug,rule,duration_days,visibility,format,launch_at
) values (
  '29000000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000002',
  'Notification Hardening Drop',
  'notification-hardening-drop',
  'Post proof.',
  7,
  'public',
  'drop',
  null
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok(
  $$select public.register_push_token_v1('ExpoPushToken[hardeningbbbbbbbbbbbbbbbb]','ios')$$,
  'recipient registers an active Expo token'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select throws_ok(
  $$select public.register_push_token_v1('ExpoPushToken[hardeningbbbbbbbbbbbbbbbb]','android')$$,
  'P0001',
  'push token already registered',
  'another account cannot steal an enabled Expo token'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(
  public.disable_push_token_v1('ExpoPushToken[hardeningbbbbbbbbbbbbbbbb]'),
  true,
  'current owner can explicitly disable its device token'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select lives_ok(
  $$select public.register_push_token_v1('ExpoPushToken[hardeningbbbbbbbbbbbbbbbb]','android')$$,
  'a disabled device token may move to a different signed-in account'
);
reset role;
select is(
  (select user_id from public.push_tokens where token='ExpoPushToken[hardeningbbbbbbbbbbbbbbbb]'),
  '19000000-0000-0000-0000-000000000003'::uuid,
  'disabled-token transfer updates canonical ownership'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok(
  $$select public.register_push_token_v1('ExpoPushToken[hardeningbbbbbbbbbbbbbbbb2]','ios')$$,
  'recipient registers a replacement active token'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.set_follow_v1('19000000-0000-0000-0000-000000000002',true);
reset role;
select is(
  (select count(*)::int from public.job_outbox j
   where j.kind='push'
     and j.payload->>'event_key'='follow:19000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000002'),
  1,
  'follow event uses one relationship-stable dedupe key'
);
delete from public.follows
where follower_id='19000000-0000-0000-0000-000000000001'
  and followed_id='19000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.set_follow_v1('19000000-0000-0000-0000-000000000002',true);
reset role;
select is(
  (select count(*)::int from public.job_outbox j
   where j.kind='push'
     and j.payload->>'event_key'='follow:19000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000002'),
  1,
  'unfollow and refollow cannot manufacture another push'
);

insert into public.posts (
  id,user_id,challenge_id,kind,caption,visibility,status,moderation_status,published_at
) values (
  '49000000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000002',
  '29000000-0000-0000-0000-000000000001',
  'fail',
  'Notification visibility target',
  'public',
  'published',
  'approved',
  now()-interval '1 minute'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.set_post_reaction_v1('49000000-0000-0000-0000-000000000001','respect');
select public.set_post_reaction_v1('49000000-0000-0000-0000-000000000001','lol');
reset role;
select is(
  (select count(*)::int from public.job_outbox j
   where j.kind='push'
     and j.payload->>'event_key'='reaction:49000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000001'),
  1,
  'reaction changes reuse one stable post-user push event'
);

update public.job_outbox
set status='running', locked_at=now()
where payload->>'event_key'='reaction:49000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000001';
select is(
  (private.get_push_job_delivery_v1((
    select id from public.job_outbox
    where payload->>'event_key'='reaction:49000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000001'
  ))->>'allowed')::boolean,
  true,
  'delivery-time authorization allows a still-visible post route'
);

update public.posts set status='removed' where id='49000000-0000-0000-0000-000000000001';
select is(
  private.get_push_job_delivery_v1((
    select id from public.job_outbox
    where payload->>'event_key'='reaction:49000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000001'
  ))->>'reason',
  'route_hidden',
  'delivery is suppressed when queued content becomes hidden'
);
select is(
  (private.get_push_job_delivery_v1((
    select id from public.job_outbox
    where payload->>'event_key'='reaction:49000000-0000-0000-0000-000000000001:19000000-0000-0000-0000-000000000001'
  ))->>'allowed')::boolean,
  false,
  'hidden content cannot be delivered from a stale queued push'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select public.set_notification_preferences_v1(true,true,true,true,true,true,null,null,'America/Los_Angeles');
reset role;

insert into public.journeys (
  id,user_id,challenge_id,attempt_no,status,visibility,started_at
) values (
  '89000000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000002',
  '29000000-0000-0000-0000-000000000001',
  1,
  'active',
  'public',
  '2026-08-20 00:00:00+00'
);
insert into public.proofs (
  id,challenge_id,user_id,proof_type,caption,proof_date,journey_id
) values (
  '59000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000002',
  'photo',
  'Local-date proof',
  '2026-08-23',
  '89000000-0000-0000-0000-000000000001'
);
insert into public.verifications (proof_id,verifier_id,verdict) values (
  '59000000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000003',
  true
);
select ok(
  private.enqueue_due_notification_stakes_v1('2026-08-25 00:30:00+00'::timestamptz) >= 1,
  'scheduled stake evaluation runs at 17:30 recipient-local time'
);
select is(
  (select count(*)::int from public.job_outbox j
   where j.kind='push'
     and j.payload->>'event_key'='streak-risk:89000000-0000-0000-0000-000000000001:2026-08-24'),
  1,
  'streak-risk dedupe uses the recipient-local calendar date'
);
select is(
  (select count(*)::int from public.job_outbox j
   where j.kind='push'
     and j.payload->>'event_key'='streak-risk:89000000-0000-0000-0000-000000000001:2026-08-25'),
  0,
  'UTC date cannot create a false streak-risk event at the local-day boundary'
);

select * from finish();
rollback;
