begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id,email,raw_user_meta_data) values
 ('17000000-0000-0000-0000-000000000001','share-owner@example.test','{"name":"Share Owner"}'::jsonb),
 ('17000000-0000-0000-0000-000000000002','share-viewer@example.test','{"name":"Share Viewer"}'::jsonb);
update public.profiles set handle='share-owner', display_name='Share Owner' where id='17000000-0000-0000-0000-000000000001';
update public.profiles set handle='share-viewer', display_name='Share Viewer' where id='17000000-0000-0000-0000-000000000002';

insert into public.challenges (id,owner_id,title,slug,rule,duration_days,visibility,format,tagline) values
 ('27000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','Share Drop','share-drop','Post it.',7,'public','drop','Share-safe Drop'),
 ('27000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001','Private Crew','private-share','Keep it private.',7,'private','crew','Private');

insert into public.media_assets (id,owner_id,provider,media_kind,public_url,mime_type,bytes,processing_status,moderation_status) values
 ('37000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','r2','image','https://cdn.example.test/share.jpg','image/jpeg',100,'ready','approved');

insert into public.posts (id,user_id,challenge_id,media_asset_id,kind,caption,visibility,status,moderation_status,published_at) values
 ('47000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','37000000-0000-0000-0000-000000000001','fail','Public share','public','published','approved',now()-interval '1 minute'),
 ('47000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001',null,'fail','Pending','public','moderation_pending','pending',null),
 ('47000000-0000-0000-0000-000000000003','17000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002',null,'fail','Private','crew','published','approved',now()-interval '1 minute');

insert into public.proofs (id,challenge_id,user_id,proof_type,caption,proof_date) values
 ('57000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','photo','Public receipt',current_date),
 ('57000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001','photo','Private receipt',current_date);
insert into public.verifications (proof_id,verifier_id,verdict) values
 ('57000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000002',true);
insert into public.invites (id,challenge_id,inviter_id,code) values
 ('67000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001','shareinvite001');

set local role anon;
select ok(public.get_public_post_share_v1('47000000-0000-0000-0000-000000000001') is not null,'public post share snapshot is available');
select is(public.get_public_post_share_v1('47000000-0000-0000-0000-000000000001')->>'media_public_url','https://cdn.example.test/share.jpg','public post exposes only ready approved media URL');
select is(public.get_public_post_share_v1('47000000-0000-0000-0000-000000000002'),null::jsonb,'unpublished post is hidden');
select is(public.get_public_post_share_v1('47000000-0000-0000-0000-000000000003'),null::jsonb,'private post is not shareable');
select ok(public.get_public_receipt_share_v1('57000000-0000-0000-0000-000000000001') is not null,'public receipt has a share snapshot');
select is((public.get_public_receipt_share_v1('57000000-0000-0000-0000-000000000001')->>'verified_count')::int,1,'receipt verification count is derived');
select is(public.get_public_receipt_share_v1('57000000-0000-0000-0000-000000000002'),null::jsonb,'private Receipt is hidden');
select is(public.get_public_receipt_share_v1('57000000-0000-0000-0000-000000000001')->>'id','57000000-0000-0000-0000-000000000001','Receipt ID reuses proof ID');
select is(public.resolve_invite_share_v1('shareinvite001')->>'challenge_slug','private-share','valid invite capability resolves');
select is(public.resolve_invite_share_v1('missinginvite'),null::jsonb,'unknown invite does not resolve');
reset role;

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['get_public_post_share_v1','get_public_receipt_share_v1','resolve_invite_share_v1']) and not p.prosecdef),3,'public share wrappers are SECURITY INVOKER');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=any(array['get_public_post_share_v1','get_public_receipt_share_v1','resolve_invite_share_v1']) and p.prosecdef),3,'privileged share implementations are private');
select ok(has_function_privilege('anon','public.get_public_post_share_v1(uuid)','EXECUTE') and has_function_privilege('anon','public.get_public_receipt_share_v1(uuid)','EXECUTE') and has_function_privilege('anon','public.resolve_invite_share_v1(text)','EXECUTE'),'anonymous share reads retain explicit execute grants');
select is((select count(*)::int from information_schema.tables where table_schema='public' and table_name='receipts'),0,'no duplicate Receipt ledger exists');

insert into public.blocks (blocker_id,blocked_id) values ('17000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"17000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(public.get_public_post_share_v1('47000000-0000-0000-0000-000000000001'),null::jsonb,'blocked viewer cannot load public post share');
select is(public.get_public_receipt_share_v1('57000000-0000-0000-0000-000000000001'),null::jsonb,'blocked viewer cannot load canonical receipt share');
select is(public.resolve_invite_share_v1('shareinvite001'),null::jsonb,'blocked viewer cannot resolve inviter capability');
reset role;

select * from finish();
rollback;
