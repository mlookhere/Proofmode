begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'profiles','challenges','challenge_members','proofs','verifications','invites','analytics_events',
        'subscriptions','invite_claims','media_assets','journeys','posts','follows','watched_challenges',
        'post_reactions','comments','user_interests','challenge_templates','blocks','reports',
        'moderation_actions','push_tokens','notification_preferences','job_outbox'
      ])
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  'RLS is enabled on every client-facing public table'
);

select ok(
  (select count(*) >= 60 from public.challenge_templates),
  'the 60 launch challenge templates are loaded'
);

select ok(
  to_regprocedure('public.get_feed_v1(integer,numeric,timestamp with time zone,uuid)') is not null,
  'keyset feed RPC exists'
);

select ok(
  to_regprocedure('public.join_challenge_v2(text,text)') is not null,
  'challenge join RPC exists'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '10000000-0000-0000-0000-000000000001',
  'proofmode-owner@example.test',
  '{"name":"ProofMode Owner"}'::jsonb
);

select is(
  (select display_name from public.profiles where id = '10000000-0000-0000-0000-000000000001'),
  'ProofMode Owner',
  'auth user trigger creates the profile with display name'
);

select ok(
  (select handle is not null and referral_code is not null from public.profiles where id = '10000000-0000-0000-0000-000000000001'),
  'auth user trigger creates public handle and referral code'
);

insert into public.challenges (
  id, owner_id, title, slug, rule, duration_days, visibility
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Verification Drop',
  'verification-drop',
  'Post one proof per day.',
  7,
  'public'
);

select is(
  (select role from public.challenge_members
   where challenge_id = '20000000-0000-0000-0000-000000000001'
     and user_id = '10000000-0000-0000-0000-000000000001'),
  'owner',
  'challenge creation trigger creates owner membership'
);

select * from finish();
rollback;
