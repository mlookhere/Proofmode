begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000021', 'proofmode-feed@example.test', '{"name":"Feed User"}'::jsonb);

insert into public.posts (
  id, user_id, kind, caption, visibility, status, moderation_status, published_at
) values
  ('30000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', 'proof', 'Newest public proof', 'public', 'published', 'approved', '2026-08-03T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000021', 'proof', 'Middle public proof', 'public', 'published', 'approved', '2026-08-02T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000021', 'proof', 'Oldest public proof', 'public', 'published', 'approved', '2026-08-01T12:00:00Z'),
  ('30000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000021', 'proof', 'Future public proof', 'public', 'published', 'approved', now() + interval '1 day');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::int from public.get_feed_v1(20, null, null, null)
   where post_id in (
     '30000000-0000-0000-0000-000000000021',
     '30000000-0000-0000-0000-000000000022',
     '30000000-0000-0000-0000-000000000023'
   )),
  3,
  'anonymous feed RPC returns visible public posts'
);

select is(
  (select count(*)::int from public.get_feed_v1(20, null, null, null)
   where post_id = '30000000-0000-0000-0000-000000000024'),
  0,
  'future-dated published posts are excluded until publication time'
);

select is(
  (
    with first_page as (
      select * from public.get_feed_v1(2, null, null, null)
    ), cursor_row as (
      select score, published_at, post_id
      from first_page
      order by score desc, published_at desc, post_id desc
      offset 1 limit 1
    )
    select count(*)::int
    from cursor_row c
    cross join lateral public.get_feed_v1(2, c.score, c.published_at, c.post_id) next_page
    where next_page.post_id = '30000000-0000-0000-0000-000000000023'
  ),
  1,
  'feed keyset cursor reaches the remaining post without replaying the first page'
);

select * from finish();
rollback;
