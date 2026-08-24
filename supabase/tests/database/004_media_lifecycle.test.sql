begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(
  to_regclass('public.posts_media_asset_unique_idx') is not null,
  'one media asset can back at most one post'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('41000000-0000-0000-0000-000000000001', 'media-owner@example.test', '{"name":"Media Owner"}'::jsonb);

insert into public.challenges (id, owner_id, title, slug, rule, duration_days, visibility)
values (
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Media Drop',
  'media-drop-test',
  'Post media.',
  7,
  'public'
);

insert into public.media_assets (
  id, owner_id, provider, media_kind, storage_key, mime_type, bytes, processing_status, moderation_status
) values (
  '43000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'r2',
  'image',
  '41000000-0000-0000-0000-000000000001/test.jpg',
  'image/jpeg',
  1000,
  'uploading',
  'pending'
);

insert into public.posts (
  id, user_id, challenge_id, media_asset_id, kind, caption, visibility, status, moderation_status
) values (
  '44000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001',
  'proof',
  'Lifecycle test',
  'public',
  'uploading',
  'pending'
);

update public.media_assets set processing_status = 'processing' where id = '43000000-0000-0000-0000-000000000001';
select is(
  (select status from public.posts where id = '44000000-0000-0000-0000-000000000001'),
  'processing',
  'processing media moves its post to processing'
);

update public.media_assets set processing_status = 'failed' where id = '43000000-0000-0000-0000-000000000001';
select is(
  (select status from public.posts where id = '44000000-0000-0000-0000-000000000001'),
  'draft',
  'failed media returns its post to a recoverable draft'
);

update public.media_assets set processing_status = 'ready' where id = '43000000-0000-0000-0000-000000000001';
select is(
  (select status from public.posts where id = '44000000-0000-0000-0000-000000000001'),
  'moderation_pending',
  'ready media enters moderation'
);

select is(
  (select count(*)::int from public.job_outbox where dedupe_key = 'moderation:media:43000000-0000-0000-0000-000000000001'),
  1,
  'ready media enqueues moderation once'
);

update public.media_assets set moderation_status = 'approved' where id = '43000000-0000-0000-0000-000000000001';
select ok(
  (select status = 'published' and moderation_status = 'approved' and published_at is not null
   from public.posts where id = '44000000-0000-0000-0000-000000000001'),
  'approved ready media publishes its post'
);

insert into public.media_assets (id, owner_id, provider, media_kind, storage_key, processing_status, moderation_status)
values (
  '43000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000001',
  'r2', 'image', 'rejected.jpg', 'ready', 'pending'
);
insert into public.posts (id, user_id, challenge_id, media_asset_id, kind, visibility, status, moderation_status)
values (
  '44000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000002',
  'fail', 'public', 'moderation_pending', 'pending'
);
update public.media_assets set moderation_status = 'rejected' where id = '43000000-0000-0000-0000-000000000002';
select is(
  (select status from public.posts where id = '44000000-0000-0000-0000-000000000002'),
  'removed',
  'rejected media removes its post'
);

insert into public.media_assets (id, owner_id, provider, media_kind, playback_id, processing_status, moderation_status)
values (
  '43000000-0000-0000-0000-000000000003',
  '41000000-0000-0000-0000-000000000001',
  'stream', 'video', 'stream-test', 'uploading', 'pending'
);
insert into public.posts (id, user_id, challenge_id, media_asset_id, kind, visibility, status, moderation_status)
values (
  '44000000-0000-0000-0000-000000000003',
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000003',
  'almost', 'public', 'uploading', 'pending'
);
update public.media_assets set processing_status = 'deleted' where id = '43000000-0000-0000-0000-000000000003';
select is(
  (select status from public.posts where id = '44000000-0000-0000-0000-000000000003'),
  'removed',
  'deleted media removes its post'
);

select throws_ok(
  $$insert into public.posts (user_id, challenge_id, media_asset_id, kind, visibility, status, moderation_status)
    values (
      '41000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000001',
      'proof', 'public', 'draft', 'pending'
    )$$,
  '23505',
  null,
  'a media asset cannot be attached to a second post'
);

select * from finish();
rollback;
