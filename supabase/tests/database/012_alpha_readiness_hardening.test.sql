begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id,email,raw_user_meta_data) values
 ('1b000000-0000-0000-0000-000000000001','hardening-a@example.test','{"name":"Hardening A"}'::jsonb);

select ok(not has_table_privilege('anon', 'public.subscriptions', 'TRUNCATE'), 'anon cannot truncate subscriptions');
select ok(not has_table_privilege('authenticated', 'public.subscriptions', 'REFERENCES'), 'authenticated cannot reference subscriptions');
select ok(not has_table_privilege('authenticated', 'public.challenges', 'TRIGGER'), 'authenticated cannot create triggers on challenges');

select ok(has_table_privilege('anon', 'public.analytics_events', 'INSERT'), 'anonymous analytics insert remains available');
select ok(has_table_privilege('authenticated', 'public.analytics_events', 'INSERT'), 'authenticated analytics insert remains available');
select ok(not has_table_privilege('authenticated', 'public.analytics_events', 'UPDATE'), 'analytics update is not a client capability');
select ok(not has_table_privilege('anon', 'public.analytics_events', 'SELECT'), 'analytics events are not client-readable');

select ok(has_table_privilege('authenticated', 'public.challenges', 'SELECT'), 'authenticated challenge read remains available');
select ok(has_table_privilege('authenticated', 'public.challenges', 'INSERT'), 'authenticated challenge creation remains available');
select ok(has_table_privilege('authenticated', 'public.challenges', 'UPDATE'), 'authenticated challenge owner update remains available');
select ok(not has_table_privilege('authenticated', 'public.challenges', 'DELETE'), 'challenge deletion is not a direct client capability');
select ok(not has_table_privilege('anon', 'public.challenges', 'INSERT'), 'anonymous challenge creation is denied');

select ok(has_table_privilege('authenticated', 'public.challenge_members', 'SELECT'), 'membership read remains available to authenticated clients');
select ok(not has_table_privilege('authenticated', 'public.challenge_members', 'INSERT'), 'membership writes remain RPC-owned');
select ok(has_table_privilege('anon', 'public.challenge_templates', 'SELECT'), 'template public read remains available');
select ok(not has_table_privilege('anon', 'public.challenge_templates', 'DELETE'), 'template mutation is denied to anonymous clients');

select ok(has_table_privilege('authenticated', 'public.user_interests', 'INSERT'), 'interest insert remains an intentional client path');
select ok(has_table_privilege('authenticated', 'public.user_interests', 'DELETE'), 'interest delete remains an intentional client path');
select ok(not has_table_privilege('authenticated', 'public.user_interests', 'UPDATE'), 'interest updates are not required');
select ok(has_table_privilege('authenticated', 'public.watched_challenges', 'INSERT'), 'Watch Drop insert remains an intentional client path');
select ok(has_table_privilege('authenticated', 'public.watched_challenges', 'DELETE'), 'Watch Drop delete remains an intentional client path');
select ok(not has_table_privilege('authenticated', 'public.watched_challenges', 'UPDATE'), 'Watch Drop update is not required');

select is((select count(*)::int from pg_policies where schemaname='public' and policyname in (
  'users comment','users delete own comments','users update own live comments',
  'crew members create room messages','users delete own room messages',
  'users follow','users unfollow','members create invites','inviter deletes invites',
  'users create own journeys','users update own journeys','users react','users change own reaction',
  'users remove own reaction','users insert own proofs','users submit reports',
  'members verify proofs','members update own verification','profiles self update','blocker manages blocks'
)), 0, 'obsolete direct-mutation policies are removed');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='blocks' and policyname='blocker reads own blocks' and cmd='SELECT'), 'block caller read policy replaces obsolete ALL policy');

select ok(not has_function_privilege('authenticated', 'public.claim_revenuecat_refresh_v1(uuid)', 'EXECUTE'), 'authenticated cannot invoke billing refresh lease');
select ok(not has_function_privilege('anon', 'public.claim_revenuecat_refresh_v1(uuid)', 'EXECUTE'), 'anon cannot invoke billing refresh lease');
select ok(has_function_privilege('service_role', 'public.claim_revenuecat_refresh_v1(uuid)', 'EXECUTE'), 'service role can invoke billing refresh lease');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"1b000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.claim_revenuecat_refresh_v1('1b000000-0000-0000-0000-000000000001')$$, '42501', null, 'client cannot claim provider refresh window');
reset role;

set local role service_role;
select is(public.claim_revenuecat_refresh_v1('1b000000-0000-0000-0000-000000000001'), 0, 'first provider refresh claim succeeds');
select ok(public.claim_revenuecat_refresh_v1('1b000000-0000-0000-0000-000000000001') between 1 and 60, 'immediate duplicate refresh is durably rate limited');
reset role;
select is((select count(*)::int from public.billing_events where event_id='refresh-window:1b000000-0000-0000-0000-000000000001'), 1, 'refresh limiter reuses one durable billing row per user');

update public.billing_events
set processed_at = pg_catalog.clock_timestamp() - interval '61 seconds'
where event_id='refresh-window:1b000000-0000-0000-0000-000000000001';
set local role service_role;
select is(public.claim_revenuecat_refresh_v1('1b000000-0000-0000-0000-000000000001'), 0, 'refresh claim reopens after the fixed window');
reset role;

select * from finish();
rollback;
