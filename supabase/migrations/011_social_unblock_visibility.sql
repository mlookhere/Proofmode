-- Complete the Social Actions safety contract: keep writes RPC-only and expose the caller's block list for unblock UI.

revoke insert, update, delete on table public.follows from anon, authenticated;
revoke insert, update, delete on table public.post_reactions from anon, authenticated;
revoke insert, update, delete on table public.comments from anon, authenticated;
revoke insert, update, delete on table public.blocks from anon, authenticated;
revoke insert, update, delete on table public.reports from anon, authenticated;
revoke insert, update, delete on table public.crew_messages from anon, authenticated;

create or replace function public.get_my_blocks_v1()
returns table (
  user_id uuid,
  display_name text,
  handle text,
  blocked_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select
    b.blocked_id,
    coalesce(p.display_name, p.handle, 'Member'),
    p.handle,
    b.created_at
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc, b.blocked_id;
$$;

revoke all on function public.get_my_blocks_v1() from public, anon, authenticated;
grant execute on function public.get_my_blocks_v1() to authenticated;
