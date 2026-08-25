begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id,email,raw_user_meta_data) values
 ('18000000-0000-0000-0000-000000000001','notify-a@example.test','{"name":"Notify A"}'::jsonb),
 ('18000000-0000-0000-0000-000000000002','notify-b@example.test','{"name":"Notify B"}'::jsonb),
 ('18000000-0000-0000-0000-000000000003','notify-c@example.test','{"name":"Notify C"}'::jsonb),
 ('18000000-0000-0000-0000-000000000004','notify-d@example.test','{"name":"Notify D"}'::jsonb);

update public.profiles set handle='notify-a', display_name='Notify A' where id='18000000-0000-0000-0000-000000000001';
update public.profiles set handle='notify-b', display_name='Notify B' where id='18000000-0000-0000-0000-000000000002';
update public.profiles set handle='notify-c', display_name='Notify C' where id='18000000-0000-0000-0000-000000000003';
update public.profiles set handle='notify-d', display_name='Notify D' where id='18000000-0000-0000-0000-000000000004';

insert into public.challenges (
  id,owner_id,title,slug,rule,duration_days,visibility,format,launch_at
) values
 ('28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000002','Notification Drop','notification-drop','Post proof.',7,'public','drop',now()-interval '30 minutes'),
 ('28000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000002','Notification Crew','notification-crew','Move up.',7,'crew','crew',null);
insert into public.challenge_members (challenge_id,user_id,role) values
 ('28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001','member'),
 ('28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000003','member'),
 ('28000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000004','member');

select ok(to_regclass('public.push_deliveries') is not null,'push delivery state exists');
select is((select relrowsecurity from pg_class where oid='public.push_deliveries'::regclass),true,'push deliveries use RLS');
select is(has_table_privilege('authenticated','public.push_tokens','SELECT'),false,'authenticated cannot directly read push tokens');
select is(has_table_privilege('authenticated','public.push_tokens','INSERT'),false,'authenticated cannot directly insert push tokens');
select is(has_table_privilege('authenticated','public.notification_preferences','UPDATE'),false,'authenticated cannot directly update notification preferences');
select is(has_table_privilege('authenticated','public.push_deliveries','SELECT'),false,'authenticated cannot read delivery provider state');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname=any(array[
       'register_push_token_v1','disable_push_token_v1','get_notification_preferences_v1',
       'set_notification_preferences_v1','enqueue_due_notification_stakes_v1',
       'claim_push_jobs_v1','get_push_job_delivery_v1'
     ]) and not p.prosecdef),
  7,
  'notification public RPCs are SECURITY INVOKER'
);
select ok(
  has_function_privilege('service_role','public.claim_push_jobs_v1(integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.claim_push_jobs_v1(integer)','EXECUTE'),
  'push job claiming is service-role only'
);
select ok(private.notification_route_allowed_v1('/p/48000000-0000-0000-0000-000000000001'),'canonical post route is allowed');
select ok(private.notification_route_allowed_v1('/c/notification-drop'),'canonical Drop route is allowed');
select is(private.notification_route_allowed_v1('/settings/billing'),false,'non-canonical push route is rejected');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.register_push_token_v1('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbbbb]','ios')$$,'B can register its Expo token');
select lives_ok($$select public.register_push_token_v1('ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbbbb]','ios')$$,'token registration is retry-safe');
select is(public.get_notification_preferences_v1()->>'recap','false','recap stays disabled in Stage 11');
select lives_ok($$select public.set_notification_preferences_v1(true,true,true,true,true,true,'22:00','06:00','UTC')$$,'notification preferences accept quiet hours and timezone');
select throws_ok(
  $$select public.register_push_token_v1('not-a-token','ios')$$,
  'P0001','invalid Expo push token','invalid Expo token is rejected'
);
select throws_ok(
  $$select public.set_notification_preferences_v1(true,true,true,true,true,true,null,null,'Not/AZone')$$,
  'P0001','invalid notification timezone','invalid timezone is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select public.register_push_token_v1('ExpoPushToken[cccccccccccccccccccccccc]','android');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select public.register_push_token_v1('ExpoPushToken[dddddddddddddddddddddddd]','android');
reset role;

select is(
  private.notification_run_after_v1('18000000-0000-0000-0000-000000000002','2026-08-24 23:00:00+00'::timestamptz),
  '2026-08-25 06:00:00+00'::timestamptz,
  'quiet hours defer delivery until the configured end'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select public.set_follow_v1('18000000-0000-0000-0000-000000000002',true);
reset role;
select is(
  (select count(*)::int from public.job_outbox j
   where j.kind='push' and j.payload->>'recipient_id'='18000000-0000-0000-0000-000000000002'
     and j.payload->>'class'='social'),
  1,
  'new follow enqueues one social push'
);

select is(
  private.enqueue_push_v1(
    '18000000-0000-0000-0000-000000000003','18000000-0000-0000-0000-000000000003',
    'social','self-event','Self','Self','/u/notify-c',now()
  ),
  null::bigint,
  'self notifications are suppressed'
);

insert into public.blocks(blocker_id,blocked_id)
values('18000000-0000-0000-0000-000000000003','18000000-0000-0000-0000-000000000001');
select is(
  private.enqueue_push_v1(
    '18000000-0000-0000-0000-000000000003','18000000-0000-0000-0000-000000000001',
    'social','blocked-event','Blocked','Blocked','/u/notify-a',now()
  ),
  null::bigint,
  'blocked actor notifications are suppressed'
);
delete from public.blocks where blocker_id='18000000-0000-0000-0000-000000000003' and blocked_id='18000000-0000-0000-0000-000000000001';

select ok(private.enqueue_push_v1(
  '18000000-0000-0000-0000-000000000003','18000000-0000-0000-0000-000000000001',
  'social','duplicate-event','Hello','One event','/u/notify-a',now()
) is not null,'first deduplicated event queues');
select ok(private.enqueue_push_v1(
  '18000000-0000-0000-0000-000000000003','18000000-0000-0000-0000-000000000001',
  'social','duplicate-event','Hello','One event','/u/notify-a',now()
) is not null,'duplicate enqueue returns the canonical existing job');
select is(
  (select count(*)::int from public.job_outbox j where j.kind='push' and j.payload->>'event_key'='duplicate-event'),
  1,
  'duplicate event creates only one outbox row'
);

insert into public.job_outbox(kind,payload,dedupe_key,status,run_after,created_at) values
 ('push','{"recipient_id":"18000000-0000-0000-0000-000000000004"}'::jsonb,'budget-d-1','pending',now(),now()-interval '20 minutes'),
 ('push','{"recipient_id":"18000000-0000-0000-0000-000000000004"}'::jsonb,'budget-d-2','pending',now(),now()-interval '15 minutes'),
 ('push','{"recipient_id":"18000000-0000-0000-0000-000000000004"}'::jsonb,'budget-d-3','pending',now(),now()-interval '10 minutes'),
 ('push','{"recipient_id":"18000000-0000-0000-0000-000000000004"}'::jsonb,'budget-d-4','pending',now(),now()-interval '5 minutes');
select is(private.notification_budget_allows_v1('18000000-0000-0000-0000-000000000004',now()),false,'hourly anti-spam budget blocks a fifth push');

delete from public.job_outbox where dedupe_key like 'budget-d-%';

insert into public.invites(id,challenge_id,inviter_id,code) values
 ('68000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000002','notifyinvite001');
insert into public.invite_claims(id,invite_id,challenge_id,inviter_id,referred_user_id) values
 ('78000000-0000-0000-0000-000000000001','68000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.job_outbox j where j.kind='push' and j.payload->>'event_key'='invite-claim:78000000-0000-0000-0000-000000000001'),
  1,
  'invite acceptance enqueues the canonical inviter push'
);

insert into public.journeys(id,user_id,challenge_id,attempt_no,status,visibility)
values('88000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001',1,'active','public');
insert into public.journey_follows(journey_id,follower_id)
values('88000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000002');
insert into public.posts(id,user_id,challenge_id,journey_id,kind,caption,visibility,status,moderation_status,published_at)
values('48000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000001','fail','Journey chapter','public','published','approved',now()-interval '1 minute');
select is(
  (select count(*)::int from public.job_outbox j where j.kind='push' and j.payload->>'event_key'='journey-post:48000000-0000-0000-0000-000000000001'),
  1,
  'published Journey chapter notifies Journey followers'
);

select ok(private.enqueue_due_notification_stakes_v1(now()) >= 1,'scheduled stake evaluator enqueues due Drop work');
select is(
  (select count(*)::int from public.job_outbox j where j.kind='push' and j.payload->>'event_key'='drop-start:28000000-0000-0000-0000-000000000001'),
  1,
  'due Drop start is deduplicated to one recipient/event row for B'
);

select ok((select count(*) from private.claim_push_jobs_v1(100)) >= 1,'service claim path claims due push jobs');
select is(
  (select j.status from public.job_outbox j where j.payload->>'event_key'='duplicate-event'),
  'running',
  'claimed push job moves to running'
);
select is(
  (private.get_push_job_delivery_v1((select j.id from public.job_outbox j where j.payload->>'event_key'='duplicate-event'))->>'allowed')::boolean,
  true,
  'delivery context rechecks preferences and returns enabled device tokens'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is(public.disable_push_token_v1('ExpoPushToken[cccccccccccccccccccccccc]'),true,'user can disable its own current device token');
reset role;
select is((select enabled from public.push_tokens where token='ExpoPushToken[cccccccccccccccccccccccc]'),false,'disabled device token is persisted server-side');

select * from finish();
rollback;
