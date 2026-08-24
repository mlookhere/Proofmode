begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000041', 'hardening-a@example.test', '{"name":"Hardening A"}'::jsonb),
  ('10000000-0000-0000-0000-000000000051', 'black-owner@example.test', '{"name":"Black Owner"}'::jsonb),
  ('10000000-0000-0000-0000-000000000052', 'black-joiner@example.test', '{"name":"Black Joiner"}'::jsonb),
  ('10000000-0000-0000-0000-000000000053', 'black-m1@example.test', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000054', 'black-m2@example.test', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000055', 'black-m3@example.test', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000056', 'black-m4@example.test', '{}'::jsonb),
  ('10000000-0000-0000-0000-000000000057', 'black-m5@example.test', '{}'::jsonb);

update public.profiles set handle = 'hardening-a' where id = '10000000-0000-0000-0000-000000000041';
update public.profiles set handle = 'black-owner', plan = 'black' where id = '10000000-0000-0000-0000-000000000051';
update public.profiles set handle = 'black-joiner' where id = '10000000-0000-0000-0000-000000000052';

insert into public.challenges (
  id, owner_id, title, slug, rule, duration_days, visibility, format, seat_cap, founder_cutoff
) values
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041', 'Hardening Drop', 'hardening-drop', 'Post proof.', 7, 'public', 'drop', 25, 5),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000051', 'Black Capacity Drop', 'black-capacity-drop', 'Join beyond five.', 7, 'public', 'drop', 100000, 5);

insert into public.challenge_members (challenge_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041', 'member'),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000053', 'member'),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000054', 'member'),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000055', 'member'),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000056', 'member'),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000057', 'member');

insert into public.posts (
  id, user_id, challenge_id, kind, caption, visibility, status, moderation_status
) values
  ('30000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000041', 'proof', 'Initial proof', 'public', 'uploading', 'pending'),
  ('30000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000041', 'reset', 'FORCE LINK FAILURE', 'public', 'uploading', 'pending'),
  ('30000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000041', '20000000-0000-0000-0000-000000000041', 'reset', 'Successful reset', 'public', 'uploading', 'pending');

select is(has_table_privilege('authenticated', 'public.posts', 'INSERT'), false, 'authenticated cannot directly insert posts');
select is(has_table_privilege('authenticated', 'public.posts', 'UPDATE'), false, 'authenticated cannot directly update posts');
select is(has_table_privilege('authenticated', 'public.posts', 'DELETE'), false, 'authenticated cannot directly delete posts');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.posts (user_id, kind, caption, visibility, status, moderation_status) values ('10000000-0000-0000-0000-000000000041', 'proof', 'bypass', 'public', 'uploading', 'pending')$$,
  '42501',
  null,
  'direct post insert is denied at the table boundary'
);
reset role;

select is(
  (select count(*)::int
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any(array['get_feed_v1','get_challenge_landing','get_public_challenge_snapshot','join_challenge_v2'])
     and not p.prosecdef),
  4,
  'legacy public entrypoints are invoker wrappers'
);
select is(
  (select count(*)::int
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = any(array['get_feed_v1','get_challenge_landing','get_public_challenge_snapshot','join_challenge_v2'])
     and p.prosecdef),
  4,
  'legacy privileged implementations live in private'
);
select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assign_post_journey_v1'),
  false,
  'post Journey public RPC is invoker-only'
);
select is(
  (select p.prosecdef from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'assign_post_journey_v1'),
  true,
  'post Journey privileged implementation is private'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select ok(public.assign_post_journey_v1('30000000-0000-0000-0000-000000000041', null) is not null, 'ordinary post receives a Journey');
select is(
  (select p.journey_id from public.posts p where p.id = '30000000-0000-0000-0000-000000000041'),
  (select j.id from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.attempt_no = 1),
  'ordinary post is linked to attempt one'
);
select is(
  (select count(*)::int from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.status = 'active'),
  1,
  'ordinary assignment leaves exactly one active attempt'
);
reset role;

create or replace function public.test_reject_journey_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.caption = 'FORCE LINK FAILURE' then raise exception 'forced link failure'; end if;
  return new;
end;
$$;
create trigger test_reject_journey_link
before update of journey_id on public.posts
for each row execute function public.test_reject_journey_link();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select throws_like(
  $$select public.assign_post_journey_v1('30000000-0000-0000-0000-000000000042', 'reset-failure-0001')$$,
  '%forced link failure%',
  'forced post-link failure aborts Reset assignment'
);
select is(
  (select count(*)::int from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041'),
  1,
  'failed post link rolls back the new Reset attempt'
);
select is(
  (select status from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.attempt_no = 1),
  'active',
  'failed post link rolls back ending the prior attempt'
);
select is(
  (select journey_id from public.posts where id = '30000000-0000-0000-0000-000000000042'),
  null::uuid,
  'failed Reset post remains unlinked'
);
reset role;

drop trigger test_reject_journey_link on public.posts;
drop function public.test_reject_journey_link();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select ok(public.assign_post_journey_v1('30000000-0000-0000-0000-000000000043', 'reset-success-0001') is not null, 'successful Reset creates the next attempt');
select is(
  (select status from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.attempt_no = 1),
  'ended',
  'successful Reset ends attempt one'
);
select is(
  (select attempt_no from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.status = 'active'),
  2,
  'successful Reset activates attempt two'
);
select is(
  (select p.journey_id from public.posts p where p.id = '30000000-0000-0000-0000-000000000043'),
  (select j.id from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.attempt_no = 2),
  'successful Reset post links to attempt two'
);
select is(
  public.assign_post_journey_v1('30000000-0000-0000-0000-000000000043', 'reset-success-0001'),
  (select j.id from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041' and j.attempt_no = 2),
  'post Journey assignment retry is idempotent'
);
select is(
  (select count(*)::int from public.journeys j where j.user_id = '10000000-0000-0000-0000-000000000041' and j.challenge_id = '20000000-0000-0000-0000-000000000041'),
  2,
  'Reset retry cannot manufacture another attempt'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000052","role":"authenticated"}', true);
select is(public.join_challenge_v2('black-capacity-drop', null), '20000000-0000-0000-0000-000000000051'::uuid, 'Black-owned Drop accepts member six');
select is(
  (select count(*)::int from public.challenge_members where challenge_id = '20000000-0000-0000-0000-000000000051'),
  6,
  'Black capacity is not capped at the free five-member limit'
);
reset role;

select ok(
  has_function_privilege('anon', 'public.get_feed_v1(integer,numeric,timestamp with time zone,uuid)', 'EXECUTE')
  and has_function_privilege('anon', 'public.get_challenge_landing(text,text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.get_public_challenge_snapshot(text)', 'EXECUTE'),
  'anonymous public read RPC access is preserved'
);
select ok(
  has_function_privilege('authenticated', 'public.join_challenge_v2(text,text)', 'EXECUTE'),
  'authenticated join RPC access is preserved'
);

select * from finish();
rollback;
