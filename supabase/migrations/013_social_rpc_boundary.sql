-- Keep newly introduced privileged Social Actions implementations out of the exposed public schema.
-- Public RPC names remain stable through SECURITY INVOKER wrappers.

alter function public.set_follow_v1(uuid, boolean) set schema private;
alter function public.set_post_reaction_v1(uuid, text) set schema private;
alter function public.create_comment_v1(uuid, text) set schema private;
alter function public.delete_comment_v1(uuid) set schema private;
alter function public.set_block_v1(uuid, boolean) set schema private;
alter function public.submit_report_v1(text, uuid, text, text) set schema private;
alter function public.get_post_comments_v1(uuid, int) set schema private;
alter function public.get_my_crews_v1() set schema private;
alter function public.get_crew_room_v1(uuid) set schema private;
alter function public.post_crew_message_v1(uuid, text) set schema private;
alter function public.delete_crew_message_v1(uuid) set schema private;
alter function public.create_crew_invite_v1(uuid) set schema private;
alter function public.get_my_blocks_v1() set schema private;

-- The original report function parameter names collide with reports.target_type/target_id
-- inside PL/pgSQL ON CONFLICT inference. Recreate only the private implementation with
-- non-colliding names while preserving the public RPC argument contract below.
drop function private.submit_report_v1(text, uuid, text, text);
create function private.submit_report_v1(
  p_target_type text,
  p_target_id uuid,
  p_target_reason text,
  p_target_details text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  report_id uuid;
  details_value text := nullif(btrim(coalesce(p_target_details, '')), '');
  allowed boolean := false;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_target_id is null then raise exception 'report target required'; end if;
  if p_target_type not in ('post', 'comment', 'user', 'challenge') then raise exception 'invalid report target'; end if;
  if p_target_reason not in ('spam', 'harassment', 'hate', 'dangerous', 'sexual', 'self_harm', 'illegal', 'impersonation', 'other') then
    raise exception 'invalid report reason';
  end if;
  if details_value is not null and char_length(details_value) > 1000 then raise exception 'report details too long'; end if;

  case p_target_type
    when 'post' then
      select private.can_view_post(p_target_id) into allowed;
    when 'comment' then
      select exists (
        select 1 from public.comments c
        where c.id = p_target_id
          and c.status = 'published'
          and private.can_view_post(c.post_id)
          and not private.is_blocked_pair(actor_id, c.user_id)
      ) into allowed;
    when 'user' then
      select exists (select 1 from public.profiles p where p.id = p_target_id and p.id <> actor_id) into allowed;
    when 'challenge' then
      select exists (
        select 1 from public.challenges c
        where c.id = p_target_id
          and (
            c.visibility = 'public'
            or c.owner_id = actor_id
            or private.is_challenge_member(c.id)
          )
      ) into allowed;
  end case;

  if not allowed then raise exception 'report target not visible'; end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (actor_id, p_target_type, p_target_id::text, p_target_reason, details_value)
  on conflict (reporter_id, target_type, target_id, reason)
    where status in ('open', 'reviewing')
  do update set details = coalesce(excluded.details, public.reports.details)
  returning id into report_id;

  return report_id;
end;
$$;

revoke all on function private.set_follow_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function private.set_post_reaction_v1(uuid, text) from public, anon, authenticated;
revoke all on function private.create_comment_v1(uuid, text) from public, anon, authenticated;
revoke all on function private.delete_comment_v1(uuid) from public, anon, authenticated;
revoke all on function private.set_block_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function private.submit_report_v1(text, uuid, text, text) from public, anon, authenticated;
revoke all on function private.get_post_comments_v1(uuid, int) from public, anon, authenticated;
revoke all on function private.get_my_crews_v1() from public, anon, authenticated;
revoke all on function private.get_crew_room_v1(uuid) from public, anon, authenticated;
revoke all on function private.post_crew_message_v1(uuid, text) from public, anon, authenticated;
revoke all on function private.delete_crew_message_v1(uuid) from public, anon, authenticated;
revoke all on function private.create_crew_invite_v1(uuid) from public, anon, authenticated;
revoke all on function private.get_my_blocks_v1() from public, anon, authenticated;

grant execute on function private.get_post_comments_v1(uuid, int) to anon, authenticated;
grant execute on function private.set_follow_v1(uuid, boolean) to authenticated;
grant execute on function private.set_post_reaction_v1(uuid, text) to authenticated;
grant execute on function private.create_comment_v1(uuid, text) to authenticated;
grant execute on function private.delete_comment_v1(uuid) to authenticated;
grant execute on function private.set_block_v1(uuid, boolean) to authenticated;
grant execute on function private.submit_report_v1(text, uuid, text, text) to authenticated;
grant execute on function private.get_my_crews_v1() to authenticated;
grant execute on function private.get_crew_room_v1(uuid) to authenticated;
grant execute on function private.post_crew_message_v1(uuid, text) to authenticated;
grant execute on function private.delete_crew_message_v1(uuid) to authenticated;
grant execute on function private.create_crew_invite_v1(uuid) to authenticated;
grant execute on function private.get_my_blocks_v1() to authenticated;

create function public.set_follow_v1(target_user uuid, should_follow boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.set_follow_v1(target_user, should_follow);
$$;

create function public.set_post_reaction_v1(target_post uuid, target_reaction text default null)
returns text language sql security invoker set search_path = '' as $$
  select private.set_post_reaction_v1(target_post, target_reaction);
$$;

create function public.create_comment_v1(target_post uuid, target_body text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_comment_v1(target_post, target_body);
$$;

create function public.delete_comment_v1(target_comment uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.delete_comment_v1(target_comment);
$$;

create function public.set_block_v1(target_user uuid, should_block boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select private.set_block_v1(target_user, should_block);
$$;

create function public.submit_report_v1(
  target_type text,
  target_id uuid,
  target_reason text,
  target_details text default null
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.submit_report_v1(target_type, target_id, target_reason, target_details);
$$;

create function public.get_post_comments_v1(target_post uuid, max_items int default 50)
returns table (
  comment_id uuid,
  user_id uuid,
  display_name text,
  handle text,
  body text,
  created_at timestamptz,
  is_own boolean
) language sql stable security invoker set search_path = '' as $$
  select * from private.get_post_comments_v1(target_post, max_items);
$$;

create function public.get_my_crews_v1()
returns table (
  crew_id uuid,
  title text,
  slug text,
  cover_emoji text,
  member_count bigint,
  last_activity_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select * from private.get_my_crews_v1();
$$;

create function public.get_crew_room_v1(target_crew uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_crew_room_v1(target_crew);
$$;

create function public.post_crew_message_v1(target_crew uuid, target_body text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.post_crew_message_v1(target_crew, target_body);
$$;

create function public.delete_crew_message_v1(target_message uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.delete_crew_message_v1(target_message);
$$;

create function public.create_crew_invite_v1(target_crew uuid)
returns text language sql security invoker set search_path = '' as $$
  select private.create_crew_invite_v1(target_crew);
$$;

create function public.get_my_blocks_v1()
returns table (
  user_id uuid,
  display_name text,
  handle text,
  blocked_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select * from private.get_my_blocks_v1();
$$;

revoke all on function public.get_post_comments_v1(uuid, int) from public, anon, authenticated;
grant execute on function public.get_post_comments_v1(uuid, int) to anon, authenticated;

revoke all on function public.set_follow_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_post_reaction_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.create_comment_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_comment_v1(uuid) from public, anon, authenticated;
revoke all on function public.set_block_v1(uuid, boolean) from public, anon, authenticated;
revoke all on function public.submit_report_v1(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_my_crews_v1() from public, anon, authenticated;
revoke all on function public.get_crew_room_v1(uuid) from public, anon, authenticated;
revoke all on function public.post_crew_message_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_crew_message_v1(uuid) from public, anon, authenticated;
revoke all on function public.create_crew_invite_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_my_blocks_v1() from public, anon, authenticated;

grant execute on function public.set_follow_v1(uuid, boolean) to authenticated;
grant execute on function public.set_post_reaction_v1(uuid, text) to authenticated;
grant execute on function public.create_comment_v1(uuid, text) to authenticated;
grant execute on function public.delete_comment_v1(uuid) to authenticated;
grant execute on function public.set_block_v1(uuid, boolean) to authenticated;
grant execute on function public.submit_report_v1(text, uuid, text, text) to authenticated;
grant execute on function public.get_my_crews_v1() to authenticated;
grant execute on function public.get_crew_room_v1(uuid) to authenticated;
grant execute on function public.post_crew_message_v1(uuid, text) to authenticated;
grant execute on function public.delete_crew_message_v1(uuid) to authenticated;
grant execute on function public.create_crew_invite_v1(uuid) to authenticated;
grant execute on function public.get_my_blocks_v1() to authenticated;
