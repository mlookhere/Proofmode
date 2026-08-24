-- Keep the public report RPC contract while removing PL/pgSQL name collisions from its private implementation.

drop function public.submit_report_v1(text, uuid, text, text);
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

revoke all on function private.submit_report_v1(text, uuid, text, text) from public, anon, authenticated;
grant execute on function private.submit_report_v1(text, uuid, text, text) to authenticated;

create function public.submit_report_v1(
  target_type text,
  target_id uuid,
  target_reason text,
  target_details text default null
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.submit_report_v1(target_type, target_id, target_reason, target_details);
$$;

revoke all on function public.submit_report_v1(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_report_v1(text, uuid, text, text) to authenticated;
