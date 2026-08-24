begin;

create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000021', 'social-a@example.test', '{"name":"Social A"}'::jsonb),
  ('10000000-0000-0000-0000-000000000022', 'social-b@example.test', '{"name":"Social B"}'::jsonb),
  ('10000000-0000-0000-0000-000000000023', 'social-c@example.test', '{"name":"Social C"}'::jsonb);

insert into public.challenges (
  id, owner_id, title, slug, rule, duration_days, visibility, format
) values
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', 'Social Public Drop', 'social-public-drop', 'Post proof.', 7, 'public', 'drop'),
  ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000021', 'Social Crew', 'social-crew', 'Keep each other moving.', 7, 'crew', 'crew');

insert into public.challenge_members (challenge_id, user_id, role)
values ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000022', 'member');

insert into public.posts (
  id, user_id, challenge_id, kind, caption, visibility, status, moderation_status, published_at
) values
  ('30000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', 'proof', 'Social A post', 'public', 'published', 'approved', now() - interval '2 hours'),
  ('30000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000023', null, 'proof', 'Social C post', 'public', 'published', 'approved', now() - interval '1 hour');

insert into public.comments (id, post_id, user_id, body)
values ('40000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000021', 'Comment from A');

insert into public.follows (follower_id, followed_id)
values ('10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000022');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000022","role":"authenticated"}', true);

select is(public.set_follow_v1('10000000-0000-0000-0000-000000000021', true), true, 'follow creates an edge');
select is((select count(*)::int from public.follows where follower_id = '10000000-0000-0000-0000-000000000022' and followed_id = '10000000-0000-0000-0000-000000000021'), 1, 'follow edge is persisted');
select is(public.set_follow_v1('10000000-0000-0000-0000-000000000021', true), true, 'follow is idempotent');
select is((select count(*)::int from public.follows where follower_id = '10000000-0000-0000-0000-000000000022' and followed_id = '10000000-0000-0000-0000-000000000021'), 1, 'idempotent follow does not duplicate');
select throws_like($$select public.set_follow_v1('10000000-0000-0000-0000-000000000022', true)$$, '%invalid follow target%', 'self follow is rejected');

select is(public.set_post_reaction_v1('30000000-0000-0000-0000-000000000021', 'respect'), 'respect', 'canonical reaction is accepted');
select is(public.set_post_reaction_v1('30000000-0000-0000-0000-000000000021', 'lol'), 'lol', 'reaction can be switched');
select is((select count(*)::int from public.post_reactions where post_id = '30000000-0000-0000-0000-000000000021' and user_id = '10000000-0000-0000-0000-000000000022'), 1, 'one reaction per user and post is preserved');
select throws_like($$select public.set_post_reaction_v1('30000000-0000-0000-0000-000000000021', 'invalid')$$, '%invalid reaction%', 'unknown reaction is rejected');
select is(public.set_post_reaction_v1('30000000-0000-0000-0000-000000000021', null), null::text, 'null reaction removes the reaction');
select is((select count(*)::int from public.post_reactions where post_id = '30000000-0000-0000-0000-000000000021' and user_id = '10000000-0000-0000-0000-000000000022'), 0, 'unreact removes the row');

select ok(public.create_comment_v1('30000000-0000-0000-0000-000000000021', '  Nice proof.  ') is not null, 'comment is created');
select is((select body from public.comments where post_id = '30000000-0000-0000-0000-000000000021' and user_id = '10000000-0000-0000-0000-000000000022' limit 1), 'Nice proof.', 'comment body is trimmed');
select is((select count(*)::int from public.get_post_comments_v1('30000000-0000-0000-0000-000000000021', 50)), 1, 'visible comment is returned');
select is(public.delete_comment_v1('40000000-0000-0000-0000-000000000021'), false, 'another author comment cannot be deleted');
select is(public.delete_comment_v1((select id from public.comments where post_id = '30000000-0000-0000-0000-000000000021' and user_id = '10000000-0000-0000-0000-000000000022' limit 1)), true, 'own comment can be deleted');
select is((select count(*)::int from public.get_post_comments_v1('30000000-0000-0000-0000-000000000021', 50)), 0, 'deleted comment is no longer returned');
select is((select count(*)::int from public.get_post_comments_v1('30000000-0000-0000-0000-000000000022', 50)), 1, 'third-party post initially exposes visible comment');

select is(public.set_block_v1('10000000-0000-0000-0000-000000000021', true), true, 'block is persisted');
select is((select count(*)::int from public.follows f where (f.follower_id = '10000000-0000-0000-0000-000000000021' and f.followed_id = '10000000-0000-0000-0000-000000000022') or (f.follower_id = '10000000-0000-0000-0000-000000000022' and f.followed_id = '10000000-0000-0000-0000-000000000021')), 0, 'blocking severs both follow directions');
select is((select count(*)::int from public.get_feed_v1(20, null, null, null) where post_id = '30000000-0000-0000-0000-000000000021'), 0, 'blocked author is excluded from feed');
select is((select count(*)::int from public.get_post_comments_v1('30000000-0000-0000-0000-000000000022', 50)), 0, 'blocked comment author is excluded');
select throws_like($$select public.set_follow_v1('10000000-0000-0000-0000-000000000021', true)$$, '%interaction blocked%', 'blocked pair cannot follow');
select throws_like($$select public.set_post_reaction_v1('30000000-0000-0000-0000-000000000021', 'proven')$$, '%post not visible%', 'blocked pair cannot react');
select throws_like($$select public.create_comment_v1('30000000-0000-0000-0000-000000000021', 'blocked')$$, '%post not visible%', 'blocked pair cannot comment');
select is(public.set_block_v1('10000000-0000-0000-0000-000000000021', false), false, 'unblock removes the caller block');

select ok(public.submit_report_v1('post', '30000000-0000-0000-0000-000000000021', 'harassment', 'Post report') is not null, 'post report is accepted');
select ok(public.submit_report_v1('comment', '40000000-0000-0000-0000-000000000021', 'spam', null) is not null, 'comment report is accepted');
select ok(public.submit_report_v1('user', '10000000-0000-0000-0000-000000000021', 'impersonation', null) is not null, 'user report is accepted');
select ok(public.submit_report_v1('challenge', '20000000-0000-0000-0000-000000000021', 'dangerous', null) is not null, 'Drop report is accepted');
select is((select count(*)::int from public.reports where reporter_id = '10000000-0000-0000-0000-000000000022'), 4, 'supported targets create four report rows');
select lives_ok($$select public.submit_report_v1('post', '30000000-0000-0000-0000-000000000021', 'harassment', 'Updated details')$$, 'active report repeat is idempotent');
select is((select count(*)::int from public.reports where reporter_id = '10000000-0000-0000-0000-000000000022'), 4, 'repeated report does not duplicate');
select throws_like($$select public.submit_report_v1('post', '30000000-0000-0000-0000-000000000021', 'not-a-reason', null)$$, '%invalid report reason%', 'unsupported report reason is rejected');

select is((select count(*)::int from public.get_my_crews_v1()), 1, 'member sees their Crew');
select ok(public.post_crew_message_v1('20000000-0000-0000-0000-000000000022', 'Crew check-in') is not null, 'Crew member can post a message');
select is(jsonb_array_length(public.get_crew_room_v1('20000000-0000-0000-0000-000000000022')->'messages'), 1, 'Crew room returns messages');
select is(jsonb_array_length(public.get_crew_room_v1('20000000-0000-0000-0000-000000000022')->'members'), 2, 'Crew room returns members');
select is(jsonb_array_length(public.get_crew_room_v1('20000000-0000-0000-0000-000000000022')->'leaderboard'), 2, 'Crew room returns leaderboard');
select ok(char_length(public.create_crew_invite_v1('20000000-0000-0000-0000-000000000022')) > 0, 'Crew member can mint invite code');
select is(public.delete_crew_message_v1((select id from public.crew_messages where challenge_id = '20000000-0000-0000-0000-000000000022' and user_id = '10000000-0000-0000-0000-000000000022' limit 1)), true, 'Crew member can delete own message');

select throws_ok($$insert into public.comments (post_id, user_id, body) values ('30000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000022', 'bypass')$$, '42501', null, 'direct social mutation is denied');
select throws_like($$select public.submit_report_v1('user', '10000000-0000-0000-0000-000000000022', 'other', null)$$, '%report target not visible%', 'self report is rejected');
select is((select count(*)::int from public.get_feed_v1(20, null, null, null) where post_id = '30000000-0000-0000-0000-000000000021'), 1, 'unblocked author returns to feed');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000023","role":"authenticated"}', true);
select throws_like($$select public.post_crew_message_v1('20000000-0000-0000-0000-000000000022', 'not a member')$$, '%crew not visible%', 'non-member cannot post to Crew room');

select * from finish();
rollback;
