-- Media/Create lifecycle for v0.9.0.
-- Clients may read allowed media metadata, but upload/processing/moderation state is server-owned.

create unique index if not exists posts_media_asset_unique_idx
  on public.posts(media_asset_id)
  where media_asset_id is not null;

revoke insert, update, delete on table public.media_assets from anon, authenticated;
grant select on table public.media_assets to authenticated;

create or replace function private.touch_media_asset_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists media_assets_touch_updated_at on public.media_assets;
create trigger media_assets_touch_updated_at
before update on public.media_assets
for each row execute function private.touch_media_asset_updated_at();

create or replace function private.sync_media_post_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.processing_status = 'deleted' then
    update public.posts
    set status = 'removed', updated_at = now()
    where media_asset_id = new.id and status <> 'removed';
    return new;
  end if;

  if new.moderation_status = 'rejected' then
    update public.posts
    set status = 'removed', moderation_status = 'rejected', updated_at = now()
    where media_asset_id = new.id and status <> 'removed';
    return new;
  end if;

  if new.processing_status = 'failed' then
    update public.posts
    set status = 'draft', moderation_status = 'pending', updated_at = now()
    where media_asset_id = new.id and status <> 'published';
    return new;
  end if;

  if new.processing_status = 'processing' then
    update public.posts
    set status = 'processing', updated_at = now()
    where media_asset_id = new.id and status not in ('published','removed');
    return new;
  end if;

  if new.processing_status in ('pending','uploading') then
    update public.posts
    set status = 'uploading', updated_at = now()
    where media_asset_id = new.id and status not in ('published','removed');
    return new;
  end if;

  if new.processing_status = 'ready' and new.moderation_status = 'approved' then
    update public.posts
    set
      status = 'published',
      moderation_status = 'approved',
      published_at = coalesce(published_at, now()),
      updated_at = now()
    where media_asset_id = new.id and status <> 'removed';
    return new;
  end if;

  if new.processing_status = 'ready' then
    update public.posts
    set status = 'moderation_pending', moderation_status = 'pending', updated_at = now()
    where media_asset_id = new.id and status not in ('published','removed');

    insert into public.job_outbox(kind, payload, dedupe_key)
    values (
      'moderation',
      jsonb_build_object('media_asset_id', new.id),
      'moderation:media:' || new.id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists media_assets_sync_post_lifecycle on public.media_assets;
create trigger media_assets_sync_post_lifecycle
after update of processing_status, moderation_status on public.media_assets
for each row
when (
  old.processing_status is distinct from new.processing_status
  or old.moderation_status is distinct from new.moderation_status
)
execute function private.sync_media_post_lifecycle();
