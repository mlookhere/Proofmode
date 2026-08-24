-- Remove Social Actions performance-advisor findings introduced by the new room/read policies.

create index if not exists crew_messages_user_idx
  on public.crew_messages(user_id);

drop policy if exists "crew members read room messages" on public.crew_messages;
create policy "crew members read room messages" on public.crew_messages for select
using (
  private.is_challenge_member(challenge_id)
  and not private.is_blocked_pair((select auth.uid()), user_id)
);

drop policy if exists "crew members create room messages" on public.crew_messages;
create policy "crew members create room messages" on public.crew_messages for insert
with check (
  user_id = (select auth.uid())
  and private.is_challenge_member(challenge_id)
);

drop policy if exists "users delete own room messages" on public.crew_messages;
create policy "users delete own room messages" on public.crew_messages for delete
using (user_id = (select auth.uid()));

drop policy if exists "profiles visible unless blocked" on public.profiles;
create policy "profiles visible unless blocked" on public.profiles for select
using (
  id = (select auth.uid())
  or not private.is_blocked_pair((select auth.uid()), id)
);

drop policy if exists "view comments on visible posts" on public.comments;
create policy "view comments on visible posts" on public.comments for select
using (
  status = 'published'
  and private.can_view_post(post_id)
  and not private.is_blocked_pair((select auth.uid()), user_id)
);

drop policy if exists "users comment" on public.comments;
create policy "users comment" on public.comments for insert
with check (
  user_id = (select auth.uid())
  and status = 'published'
  and private.can_view_post(post_id)
);

drop policy if exists "users change own reaction" on public.post_reactions;
create policy "users change own reaction" on public.post_reactions for update
using (
  user_id = (select auth.uid())
  and private.can_view_post(post_id)
)
with check (
  user_id = (select auth.uid())
  and private.can_view_post(post_id)
);
