begin;

create extension if not exists pgtap with schema extensions;
select plan(50);

-- Test harness introspection only; production reads stay behind RLS/RPC boundaries.
grant select on table public.journeys, public.posts, public.proofs, public.verifications, public.journey_follows to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000031', 'journey-a@example.test', '{"name":"Journey A"}'::jsonb),
  ('10000000-0000-0000-0000-000000000032', 'journey-b@example.test', '{"name":"Journey B"}'::jsonb),
  ('10000000-0000-0000-0000-000000000033', 'journey-c@example.test', '{"name":"Journey C"}'::jsonb);

update public.profiles
set handle = case id
  when '10000000-0000-0000-0000-000000000031' then 'journey-a'
  when '10000000-0000-0000-0000-000000000032' then 'journey-b'
  else 'journey-c'
end
where id in (
  '10000000-0000-0000-0000-000000000031',
  '10000000-0000-0000-0000-000000000032',
  '10000000-0000-0000-0000-000000000033'
);

insert into public.challenges (
  id, owner_id, title, slug, rule, duration_days, visibility, format
) values (
  '20000000-0000-0000-0000-000000000031',
  '10000000-0000-0000-0000-000000000031',
  'Journey Public Drop',
  'journey-public-drop',
  'Post one honest receipt per day.',
  7,
  'public',
  'drop'
);

insert into public.challenge_members (challenge_id, user_id, role)
values (
  '20000000-0000-0000-0000-000000000031',
  '10000000-0000-0000-0000-000000000032',
  'member'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000031","role":"authenticated"}', true);

select ok(
  public.ensure_journey_v1('20000000-0000-0000-0000-000000000031') is not null,
  'first Journey is created'
);
select is(
  public.ensure_journey_v1('20000000-0000-0000-0000-000000000031'),
  (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and status = 'active'),
  'ensure Journey is idempotent'
);
select is(
  (select count(*)::int from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and status = 'active'),
  1,
  'only one active Journey exists'
);
select is(
  (select attempt_no from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and status = 'active'),
  1,
  'first Journey is attempt one'
);
select throws_ok(
  $$insert into public.journeys (user_id, challenge_id) values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031')$$,
  '42501',
  null,
  'direct Journey mutation is denied'
);

reset role;

insert into public.media_assets (
  id, owner_id, provider, media_kind, public_url, mime_type, bytes, processing_status, moderation_status
) values
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'r2', 'image', 'https://example.test/proof-a.jpg', 'image/jpeg', 1234, 'ready', 'approved'),
  ('50000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000031', 'r2', 'image', 'https://example.test/proof-b.jpg', 'image/jpeg', 1234, 'ready', 'approved'),
  ('50000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000031', 'r2', 'image', 'https://example.test/fail.jpg', 'image/jpeg', 1234, 'ready', 'approved'),
  ('50000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000031', 'r2', 'image', 'https://example.test/almost.jpg', 'image/jpeg', 1234, 'ready', 'approved'),
  ('50000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000031', 'r2', 'image', 'https://example.test/reset.jpg', 'image/jpeg', 1234, 'ready', 'approved');

insert into public.posts (
  id, user_id, challenge_id, journey_id, media_asset_id, kind, caption, visibility, status, moderation_status, published_at
) values (
  '30000000-0000-0000-0000-000000000031',
  '10000000-0000-0000-0000-000000000031',
  '20000000-0000-0000-0000-000000000031',
  (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1),
  '50000000-0000-0000-0000-000000000031',
  'proof',
  'Day one receipt',
  'public',
  'published',
  'approved',
  date_trunc('day', now()) - interval '10 days' + interval '12 hours'
);

select is(
  (select count(*)::int from public.proofs where challenge_id = '20000000-0000-0000-0000-000000000031' and user_id = '10000000-0000-0000-0000-000000000031'),
  1,
  'eligible published proof creates one ledger receipt'
);
select ok(
  (select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031') is not null,
  'eligible post links to its receipt'
);

insert into public.posts (
  id, user_id, challenge_id, journey_id, media_asset_id, kind, caption, visibility, status, moderation_status, published_at
) values (
  '30000000-0000-0000-0000-000000000032',
  '10000000-0000-0000-0000-000000000031',
  '20000000-0000-0000-0000-000000000031',
  (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1),
  '50000000-0000-0000-0000-000000000032',
  'pr',
  'Same-day PR',
  'public',
  'published',
  'approved',
  date_trunc('day', now()) - interval '10 days' + interval '13 hours'
);

select is(
  (select count(*)::int from public.proofs where challenge_id = '20000000-0000-0000-0000-000000000031' and user_id = '10000000-0000-0000-0000-000000000031'),
  1,
  'same-day eligible post does not duplicate the daily receipt'
);
select is(
  (select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000032'),
  (select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031'),
  'same-day eligible posts share the canonical receipt'
);

insert into public.posts (
  id, user_id, challenge_id, journey_id, media_asset_id, kind, caption, visibility, status, moderation_status, published_at
) values
  (
    '30000000-0000-0000-0000-000000000033',
    '10000000-0000-0000-0000-000000000031',
    '20000000-0000-0000-0000-000000000031',
    (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1),
    '50000000-0000-0000-0000-000000000033',
    'fail', 'Missed it', 'public', 'published', 'approved', now() - interval '2 days'
  ),
  (
    '30000000-0000-0000-0000-000000000034',
    '10000000-0000-0000-0000-000000000031',
    '20000000-0000-0000-0000-000000000031',
    (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1),
    '50000000-0000-0000-0000-000000000034',
    'almost', 'Almost', 'public', 'published', 'approved', now() - interval '1 day'
  ),
  (
    '30000000-0000-0000-0000-000000000035',
    '10000000-0000-0000-0000-000000000031',
    '20000000-0000-0000-0000-000000000031',
    (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1),
    '50000000-0000-0000-0000-000000000035',
    'reset', 'Reset story post', 'public', 'published', 'approved', now()
  );

select is((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000033'), null::uuid, 'Fail never becomes a proof receipt');
select is((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000034'), null::uuid, 'Almost never becomes a proof receipt');
select is((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000035'), null::uuid, 'Reset never becomes a proof receipt');
select is(
  (select count(*)::int from public.verifications where proof_id = (select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031')),
  0,
  'publication never self-verifies a receipt'
);

insert into public.proofs (id, challenge_id, user_id, proof_type, media_url, caption, proof_date, journey_id)
values
  ('60000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'photo', 'legacy://2', 'Day 2', current_date - 9, (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1)),
  ('60000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'photo', 'legacy://3', 'Day 3', current_date - 8, (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1)),
  ('60000000-0000-0000-0000-000000000034', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'photo', 'legacy://4', 'Day 4', current_date - 6, (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1)),
  ('60000000-0000-0000-0000-000000000035', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'photo', 'legacy://5', 'Day 5', current_date - 5, (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1)),
  ('60000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'photo', 'legacy://6', 'Day 6', current_date - 4, (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1)),
  ('60000000-0000-0000-0000-000000000037', '20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'photo', 'legacy://7', 'Day 7', current_date - 3, (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1));

insert into public.verifications (proof_id, verifier_id, verdict)
select p.id, '10000000-0000-0000-0000-000000000032', true
from public.proofs p
where p.challenge_id = '20000000-0000-0000-0000-000000000031'
  and p.user_id = '10000000-0000-0000-0000-000000000031';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000031","role":"authenticated"}', true);

select throws_like(
  $$select public.set_proof_verification_v1((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031'), true)$$,
  '%self verification not allowed%',
  'self verification is rejected'
);
select is(
  (public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1))->>'verified_count')::int,
  7,
  'Journey snapshot derives verified count'
);
select is(
  (public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1))->>'current_streak')::int,
  0,
  'broken streak resets current streak'
);
select is(
  (public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1))->>'best_streak')::int,
  4,
  'broken streak preserves best historical run'
);
select is(
  public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1))->>'status',
  'completed',
  'verified duration marks Journey complete in read model'
);
select is(
  public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1))->'timeline'->0->>'kind',
  'proof',
  'Journey timeline is chronological'
);
select is(
  jsonb_array_length(public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1))->'timeline'),
  5,
  'Journey timeline includes published story posts'
);

select ok(
  public.reset_journey_v1('20000000-0000-0000-0000-000000000031', 'reset-token-0001') is not null,
  'Reset creates the next attempt'
);
select is(
  (select status from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1),
  'ended',
  'Reset ends the prior active attempt'
);
select is(
  (select attempt_no from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and status = 'active'),
  2,
  'Reset starts attempt two'
);
select is(
  public.reset_journey_v1('20000000-0000-0000-0000-000000000031', 'reset-token-0001'),
  (select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 2),
  'Reset retry returns the same attempt'
);
select is(
  (select count(*)::int from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031'),
  2,
  'Reset retry cannot manufacture attempts'
);
select throws_like(
  $$select public.reset_journey_v1('20000000-0000-0000-0000-000000000031', 'short')$$,
  '%invalid reset token%',
  'Reset requires a durable idempotency token'
);

select is((public.get_profile_snapshot('journey-a')->>'verified_receipts')::int, 7, 'Passport derives verified receipts');
select is((public.get_profile_snapshot('journey-a')->>'completed_drops')::int, 1, 'Passport derives completed Drops');
select is((public.get_profile_snapshot('journey-a')->>'current_streak')::int, 0, 'Passport current streak follows active attempt');
select is((public.get_profile_snapshot('journey-a')->>'best_streak')::int, 4, 'Passport preserves best streak across Reset');
select is(jsonb_array_length(public.get_profile_snapshot('journey-a')->'active_journeys'), 1, 'Passport lists the new active Journey');
select is(jsonb_array_length(public.get_profile_snapshot('journey-a')->'trophy_case'), 1, 'Passport keeps completed prior attempt in Trophy Case');
select is((public.get_profile_snapshot('journey-a')->>'proof_score')::int, 84, 'Proof Score is derived from earned ledger state');

reset role;
update public.profiles set plan = 'black' where id = '10000000-0000-0000-0000-000000000031';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000031","role":"authenticated"}', true);
select is((public.get_profile_snapshot('journey-a')->>'proof_score')::int, 84, 'paid/status plan cannot change Proof Score');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000033","role":"authenticated"}', true);
select throws_like(
  $$select public.set_proof_verification_v1((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031'), true)$$,
  '%challenge membership required%',
  'outsider cannot verify a proof'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000032","role":"authenticated"}', true);
select is(public.set_proof_verification_v1((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031'), false), false, 'eligible member can reject a receipt');
select is(public.set_proof_verification_v1((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031'), true), true, 'eligible member can verify a receipt');
select is(
  (select count(*)::int from public.verifications where proof_id = (select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031') and verifier_id = '10000000-0000-0000-0000-000000000032'),
  1,
  'verification upsert remains one row'
);

select is(
  public.set_journey_follow_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1), true),
  true,
  'visible Journey can be followed'
);
select is(
  public.set_journey_follow_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and challenge_id = '20000000-0000-0000-0000-000000000031' and attempt_no = 1), true),
  true,
  'Journey follow is idempotent'
);
select is((select count(*)::int from public.journey_follows where follower_id = '10000000-0000-0000-0000-000000000032'), 1, 'Journey follow does not duplicate');
select throws_like(
  $$select public.set_journey_follow_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000032' limit 1), true)$$,
  '%journey not visible%',
  'missing Journey cannot be followed'
);

select is(public.set_block_v1('10000000-0000-0000-0000-000000000031', true), true, 'block persists across Journey graph');
select is((select count(*)::int from public.journey_follows where follower_id = '10000000-0000-0000-0000-000000000032'), 0, 'blocking severs Journey follows');
select throws_like(
  $$select public.set_journey_follow_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and attempt_no = 1), true)$$,
  '%journey not visible%',
  'blocked Journey cannot be followed'
);
select is(
  public.get_journey_snapshot_v1((select id from public.journeys where user_id = '10000000-0000-0000-0000-000000000031' and attempt_no = 1)),
  null::jsonb,
  'blocked Journey is hidden'
);
select is(public.set_block_v1('10000000-0000-0000-0000-000000000031', false), false, 'unblock restores caller visibility');

select throws_ok(
  $$insert into public.verifications (proof_id, verifier_id, verdict) values ((select proof_id from public.posts where id = '30000000-0000-0000-0000-000000000031'), '10000000-0000-0000-0000-000000000032', false) on conflict (proof_id, verifier_id) do update set verdict = false$$,
  '42501',
  null,
  'direct verification mutation is denied'
);
select throws_ok(
  $$insert into public.proofs (challenge_id, user_id, media_url) values ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000032', 'bypass')$$,
  '42501',
  null,
  'direct proof mutation is denied'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'ensure_journey_v1','reset_journey_v1','set_journey_follow_v1','set_proof_verification_v1',
        'create_legacy_proof_v1','get_journey_snapshot_v1','get_my_journey_for_drop_v1','get_profile_snapshot',
        'get_journey_posts'
      ])
      and p.prosecdef
  ),
  'Journey/Passport public RPCs are invoker-only'
);

select * from finish();
rollback;