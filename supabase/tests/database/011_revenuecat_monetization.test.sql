begin;

create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id,email,raw_user_meta_data) values
 ('1a000000-0000-0000-0000-000000000001','billing-a@example.test','{"name":"Billing A"}'::jsonb),
 ('1a000000-0000-0000-0000-000000000002','billing-b@example.test','{"name":"Billing B"}'::jsonb),
 ('1a000000-0000-0000-0000-000000000003','billing-black@example.test','{"name":"Billing Black"}'::jsonb),
 ('1a000000-0000-0000-0000-000000000004','billing-free@example.test','{"name":"Billing Free"}'::jsonb);

update public.profiles set handle='billing-a' where id='1a000000-0000-0000-0000-000000000001';
update public.profiles set handle='billing-b' where id='1a000000-0000-0000-0000-000000000002';
update public.profiles set handle='billing-black', plan='black' where id='1a000000-0000-0000-0000-000000000003';
update public.profiles set handle='billing-free' where id='1a000000-0000-0000-0000-000000000004';

select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='provider'), 'subscription ledger has provider identity');
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='entitlement'), 'subscription ledger has canonical entitlement identity');
select ok(exists (select 1 from pg_indexes where schemaname='public' and tablename='subscriptions' and indexname='subscriptions_provider_identifier_idx'), 'provider subscription identity is uniquely indexed');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"1a000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((public.get_my_entitlements_v1()->>'plan'), 'free', 'new account starts Free');
select is((public.get_my_entitlements_v1()->>'proof_plus')::boolean, false, 'Free does not imply Proof+');
select throws_ok($$select public.sync_revenuecat_entitlements_v1('client-forge','INITIAL_PURCHASE','1a000000-0000-0000-0000-000000000001',now(),array['creator']::text[],null)$$, '42501', null, 'authenticated client cannot forge RevenueCat state');
select throws_ok($$update public.subscriptions set status='active' where user_id='1a000000-0000-0000-0000-000000000001'$$, '42501', null, 'authenticated client cannot mutate subscription state directly');
reset role;

set local role service_role;
select is(public.sync_revenuecat_entitlements_v1('rc-proof-plus','INITIAL_PURCHASE','1a000000-0000-0000-0000-000000000001','2026-08-25T06:00:00Z'::timestamptz,array['proof_plus']::text[],'https://example.test/manage-a'), true, 'service sync accepts validated Proof+ snapshot');
reset role;
select is((select plan from public.profiles where id='1a000000-0000-0000-0000-000000000001'), 'pro', 'Proof+ maps to legacy internal pro plan');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"1a000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is((public.get_my_entitlements_v1()->>'proof_plus')::boolean, true, 'Proof+ entitlement is visible to its owner');
select is((public.get_my_entitlements_v1()->>'creator')::boolean, false, 'Proof+ does not imply Creator');
select is(public.get_my_entitlements_v1()->>'management_url', 'https://example.test/manage-a', 'management URL comes from validated provider state');
reset role;

set local role service_role;
select is(public.sync_revenuecat_entitlements_v1('rc-proof-plus','INITIAL_PURCHASE','1a000000-0000-0000-0000-000000000001','2026-08-25T06:00:00Z'::timestamptz,array['proof_plus']::text[],'https://example.test/manage-a'), false, 'duplicate RevenueCat event is idempotent');
select is(public.sync_revenuecat_entitlements_v1('rc-creator','RENEWAL','1a000000-0000-0000-0000-000000000001','2026-08-25T07:00:00Z'::timestamptz,array['creator']::text[],'https://example.test/manage-a'), true, 'newer Creator snapshot is accepted');
reset role;
select is((select plan from public.profiles where id='1a000000-0000-0000-0000-000000000001'), 'creator', 'Creator outranks Proof+');

set local role service_role;
select is(public.sync_revenuecat_entitlements_v1('rc-delayed','EXPIRATION','1a000000-0000-0000-0000-000000000001','2026-08-25T06:30:00Z'::timestamptz,array[]::text[],null), true, 'delayed unique event is consumed without replaying state');
reset role;
select is((select plan from public.profiles where id='1a000000-0000-0000-0000-000000000001'), 'creator', 'older RevenueCat delivery cannot downgrade newer state');
select is((select count(*)::int from public.analytics_events where user_id='1a000000-0000-0000-0000-000000000001' and event_name='subscription_renewed'), 1, 'renewal analytics is emitted once');

set local role service_role;
select throws_ok($$select public.sync_revenuecat_entitlements_v1('rc-black','INITIAL_PURCHASE','1a000000-0000-0000-0000-000000000001',now(),array['black']::text[],null)$$, 'P0001', 'invalid RevenueCat entitlement', 'provider payload can never grant Black');
select is(public.sync_revenuecat_entitlements_v1('rc-black-empty','EXPIRATION','1a000000-0000-0000-0000-000000000003','2026-08-25T08:00:00Z'::timestamptz,array[]::text[],null), true, 'Black account may receive ordinary RevenueCat lifecycle events');
reset role;
select is((select plan from public.profiles where id='1a000000-0000-0000-0000-000000000003'), 'black', 'RevenueCat cannot downgrade server-owned Black');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"1a000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is((public.get_my_entitlements_v1()->>'proof_plus')::boolean, true, 'Black inherits Proof+');
select is((public.get_my_entitlements_v1()->>'creator')::boolean, true, 'Black inherits Creator');
select is((public.get_my_entitlements_v1()->>'black')::boolean, true, 'Black remains explicit in caller entitlement state');
select ok(private.challenge_configuration_allowed('private',100000), 'Black inherits Creator challenge capacity');
reset role;

set local role service_role;
select ok(public.sync_stripe_subscription_event('evt_legacy_pro','customer.subscription.created','sub_legacy_pro','cus_legacy_pro','1a000000-0000-0000-0000-000000000002','active','pro'), 'legacy Stripe Proof+ remains a valid entitlement source');
select ok(public.sync_revenuecat_entitlements_v1('rc-b-creator','INITIAL_PURCHASE','1a000000-0000-0000-0000-000000000002','2026-08-25T09:00:00Z'::timestamptz,array['creator']::text[],null), 'RevenueCat Creator can coexist with a legacy Stripe Proof+ subscription');
reset role;
select is((select plan from public.profiles where id='1a000000-0000-0000-0000-000000000002'), 'creator', 'effective plan chooses highest active provider entitlement');

set local role service_role;
select public.sync_revenuecat_entitlements_v1('rc-b-expired','EXPIRATION','1a000000-0000-0000-0000-000000000002','2026-08-25T10:00:00Z'::timestamptz,array[]::text[],null);
reset role;
select is((select plan from public.profiles where id='1a000000-0000-0000-0000-000000000002'), 'pro', 'legacy Stripe Proof+ survives RevenueCat expiration');

select * from finish();
rollback;
