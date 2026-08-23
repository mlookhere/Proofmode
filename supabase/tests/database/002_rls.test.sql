begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000011', 'proofmode-a@example.test', '{"name":"User A"}'::jsonb),
  ('10000000-0000-0000-0000-000000000012', 'proofmode-b@example.test', '{"name":"User B"}'::jsonb);

insert into public.challenges (
  id, owner_id, title, slug, rule, duration_days, visibility
) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'Public Drop', 'rls-public-drop', 'Do the thing.', 7, 'public'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011', 'Private Drop', 'rls-private-drop', 'Invite only.', 7, 'private');

insert into public.posts (
  id, user_id, kind, caption, visibility, status, moderation_status, published_at
) values
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'proof', 'Newest public proof', 'public', 'published', 'approved', '2026-08-03T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011', 'proof', 'Middle public proof', 'public', 'published', 'approved', '2026-08-02T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000011', 'proof', 'Oldest public proof', 'public', 'published', 'approved', '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000011', 'proof', 'Private proof', 'private', 'published', 'approved', '2026-08-04T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000011', 'proof', 'Unapproved proof', 'public', 'published', 'review', '2026-08-05T12:00:00Z');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::int from public.challenges where slug like 'rls-%'),
  1,
  'anonymous users can see public challenges but not private challenges'
);

select is(
  (select count(*)::int from public.posts where id in (
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000013',
    '30000000-0000-0000-0000-000000000014',
    '30000000-0000-0000-0000-000000000015'
  )),
  3,
  'anonymous post reads expose only public approved published posts'
);

select throws_ok(
  $$insert into public.challenge_members (challenge_id, user_id) values ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000012')$$,
  '42501',
  null,
  'anonymous users cannot join a challenge directly'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.challenge_members (challenge_id, user_id) values ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000012')$$,
  '42501',
  null,
  'authenticated users cannot bypass the join RPC with direct membership inserts'
);

select lives_ok(
  $$select public.join_challenge_v2('rls-public-drop', null)$$,
  'authenticated users can join a public Drop through the RPC'
);

select is(
  (select count(*)::int from public.challenge_members
   where challenge_id = '20000000-0000-0000-0000-000000000011'
     and user_id = '10000000-0000-0000-0000-000000000012'),
  1,
  'join RPC persists the caller membership'
);

select throws_like(
  $$select public.join_challenge_v2('rls-private-drop', null)$$,
  '%invite required%',
  'private Drop cannot be joined without an invite'
);

select lives_ok(
  $$insert into public.watched_challenges (user_id, challenge_id) values ('10000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000011')$$,
  'authenticated users can watch a Drop as themselves'
);

select throws_ok(
  $$insert into public.watched_challenges (user_id, challenge_id) values ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011')$$,
  '42501',
  null,
  'authenticated users cannot write another user watch state'
);

select is(
  (select count(*)::int from public.watched_challenges
   where user_id = '10000000-0000-0000-0000-000000000012'
     and challenge_id = '20000000-0000-0000-0000-000000000011'),
  1,
  'authenticated users can read their persisted watch state'
);

select lives_ok(
  $$delete from public.watched_challenges where user_id = '10000000-0000-0000-0000-000000000012' and challenge_id = '20000000-0000-0000-0000-000000000011'$$,
  'authenticated users can unwatch their own Drop'
);

select lives_ok(
  $$update public.profiles set display_name = 'Updated User B' where id = '10000000-0000-0000-0000-000000000012'$$,
  'authenticated users can update their allowed profile fields'
);

select throws_ok(
  $$update public.profiles set plan = 'black' where id = '10000000-0000-0000-0000-000000000012'$$,
  '42501',
  null,
  'authenticated users cannot grant themselves a billing-owned plan'
);

select * from finish();
rollback;
