-- Stage 10: public share snapshots and invite landing resolution.
-- Receipts remain canonical proofs; attribution remains analytics/invite state.

create or replace function private.get_public_post_share_v1(target_post uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'kind', p.kind,
    'caption', p.caption,
    'published_at', p.published_at,
    'user_id', p.user_id,
    'handle', pf.handle,
    'display_name', pf.display_name,
    'avatar_url', pf.avatar_url,
    'challenge_id', c.id,
    'challenge_slug', c.slug,
    'challenge_title', c.title,
    'journey_id', p.journey_id,
    'proof_id', p.proof_id,
    'media_kind', m.media_kind,
    'media_public_url', case when m.processing_status = 'ready' and m.moderation_status = 'approved' then m.public_url else null end
  )
  from public.posts p
  join public.profiles pf on pf.id = p.user_id
  left join public.challenges c on c.id = p.challenge_id
  left join public.media_assets m on m.id = p.media_asset_id
  where p.id = target_post
    and p.visibility = 'public'
    and p.status = 'published'
    and p.moderation_status = 'approved'
    and p.published_at is not null
    and p.published_at <= now()
    and not private.is_blocked_pair(auth.uid(), p.user_id)
  limit 1;
$$;

create or replace function private.get_public_receipt_share_v1(target_receipt uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', pr.id,
    'user_id', pr.user_id,
    'handle', pf.handle,
    'display_name', pf.display_name,
    'avatar_url', pf.avatar_url,
    'challenge_id', pr.challenge_id,
    'challenge_slug', c.slug,
    'challenge_title', c.title,
    'challenge_rule', c.rule,
    'challenge_created_at', c.created_at,
    'proof_date', pr.proof_date,
    'caption', pr.caption,
    'post_id', pr.post_id,
    'journey_id', pr.journey_id,
    'media_kind', m.media_kind,
    'media_public_url', case when m.processing_status = 'ready' and m.moderation_status = 'approved' then m.public_url else null end,
    'verified_count', (select count(*) from public.verifications v where v.proof_id = pr.id and v.verdict = true)
  )
  from public.proofs pr
  join public.profiles pf on pf.id = pr.user_id
  join public.challenges c on c.id = pr.challenge_id
  left join public.posts p on p.id = pr.post_id
  left join public.media_assets m on m.id = pr.media_asset_id
  where pr.id = target_receipt
    and c.visibility = 'public'
    and not private.is_blocked_pair(auth.uid(), pr.user_id)
    and (
      pr.post_id is null
      or (
        p.visibility = 'public'
        and p.status = 'published'
        and p.moderation_status = 'approved'
        and p.published_at is not null
        and p.published_at <= now()
      )
    )
  limit 1;
$$;

create or replace function private.resolve_invite_share_v1(target_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', i.code,
    'challenge_id', c.id,
    'challenge_slug', c.slug,
    'challenge_title', c.title,
    'challenge_rule', c.rule,
    'challenge_tagline', c.tagline,
    'challenge_duration_days', c.duration_days,
    'challenge_visibility', c.visibility,
    'challenge_format', c.format,
    'cover_emoji', c.cover_emoji,
    'inviter_id', i.inviter_id,
    'inviter_handle', pf.handle,
    'inviter_display_name', pf.display_name
  )
  from public.invites i
  join public.challenges c on c.id = i.challenge_id
  join public.profiles pf on pf.id = i.inviter_id
  where i.code = target_code
    and char_length(target_code) between 8 and 64
    and not private.is_blocked_pair(auth.uid(), i.inviter_id)
  limit 1;
$$;

revoke all on function private.get_public_post_share_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function private.get_public_receipt_share_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function private.resolve_invite_share_v1(text) from public, anon, authenticated, service_role;
grant execute on function private.get_public_post_share_v1(uuid) to anon, authenticated, service_role;
grant execute on function private.get_public_receipt_share_v1(uuid) to anon, authenticated, service_role;
grant execute on function private.resolve_invite_share_v1(text) to anon, authenticated, service_role;

create or replace function public.get_public_post_share_v1(target_post uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_public_post_share_v1(target_post); $$;

create or replace function public.get_public_receipt_share_v1(target_receipt uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_public_receipt_share_v1(target_receipt); $$;

create or replace function public.resolve_invite_share_v1(target_code text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.resolve_invite_share_v1(target_code); $$;

revoke all on function public.get_public_post_share_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_public_receipt_share_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_invite_share_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.get_public_post_share_v1(uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_receipt_share_v1(uuid) to anon, authenticated, service_role;
grant execute on function public.resolve_invite_share_v1(text) to anon, authenticated, service_role;
