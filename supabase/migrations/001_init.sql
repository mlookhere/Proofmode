-- ProofMode production schema. Run in Supabase SQL editor or migrations.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free','pro','creator')),
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  slug text not null unique,
  rule text not null check (char_length(rule) between 1 and 240),
  duration_days int not null check (duration_days in (7,14,30,60,100)),
  visibility text not null default 'crew' check (visibility in ('crew','public','private')),
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_members (
  challenge_id uuid references public.challenges(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member','verifier')),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.proofs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  proof_type text not null default 'photo' check (proof_type in ('photo','video','link','screenshot')),
  media_url text not null,
  caption text check (char_length(caption) <= 280),
  proof_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id, proof_date)
);

create table if not exists public.verifications (
  proof_id uuid references public.proofs(id) on delete cascade,
  verifier_id uuid references auth.users(id) on delete cascade,
  verdict boolean not null,
  created_at timestamptz not null default now(),
  primary key (proof_id, verifier_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(8), 'hex'),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  source text not null default 'web',
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  stripe_subscription_id text primary key,
  stripe_customer_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null,
  plan text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.proofs enable row level security;
alter table public.verifications enable row level security;
alter table public.invites enable row level security;
alter table public.analytics_events enable row level security;
alter table public.billing_events enable row level security;
alter table public.subscriptions enable row level security;

create or replace function public.is_challenge_member(target_challenge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenge_members cm where cm.challenge_id = target_challenge and cm.user_id = auth.uid());
$$;

create or replace function public.is_challenge_owner(target_challenge uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenges c where c.id = target_challenge and c.owner_id = auth.uid());
$$;

create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);
create policy "challenges visible or owned" on public.challenges for select using (visibility = 'public' or owner_id = auth.uid() or public.is_challenge_member(id));
create policy "challenge owner insert" on public.challenges for insert with check (owner_id = auth.uid());
create policy "challenge owner update" on public.challenges for update using (owner_id = auth.uid());
create policy "memberships visible to crew" on public.challenge_members for select using (user_id = auth.uid() or public.is_challenge_member(challenge_id) or public.is_challenge_owner(challenge_id));
create policy "users can join visible challenges" on public.challenge_members for insert with check (user_id = auth.uid() and exists (select 1 from public.challenges c where c.id = challenge_id and (c.visibility = 'public' or c.owner_id = auth.uid())));
create policy "proofs visible to challenge members" on public.proofs for select using (public.is_challenge_member(challenge_id) or public.is_challenge_owner(challenge_id) or exists (select 1 from public.challenges c where c.id = challenge_id and c.visibility = 'public'));
create policy "users insert own proofs" on public.proofs for insert with check (user_id = auth.uid() and public.is_challenge_member(challenge_id));
create policy "verification visible to members" on public.verifications for select using (exists (select 1 from public.proofs p where p.id = proof_id and (public.is_challenge_member(p.challenge_id) or public.is_challenge_owner(p.challenge_id))));
create policy "members verify proofs" on public.verifications for insert with check (verifier_id = auth.uid() and exists (select 1 from public.proofs p where p.id = proof_id and public.is_challenge_member(p.challenge_id) and p.user_id <> auth.uid()));
create policy "members update own verification" on public.verifications for update using (verifier_id = auth.uid()) with check (verifier_id = auth.uid());
create policy "inviter manages invites" on public.invites for all using (inviter_id = auth.uid()) with check (inviter_id = auth.uid());
create policy "analytics insert" on public.analytics_events for insert with check (user_id is null or user_id = auth.uid());
create policy "subscription self read" on public.subscriptions for select using (user_id = auth.uid());

create or replace function public.join_public_challenge(target_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  oid uuid;
  vis text;
  owner_plan text;
  member_limit int;
  current_count int;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select c.id, c.owner_id, c.visibility into cid, oid, vis from public.challenges c where c.slug = target_slug;
  if cid is null or vis <> 'public' then raise exception 'challenge not joinable'; end if;
  if exists (select 1 from public.challenge_members cm where cm.challenge_id = cid and cm.user_id = auth.uid()) then return cid; end if;
  select p.plan into owner_plan from public.profiles p where p.id = oid;
  member_limit := case when owner_plan = 'creator' then 2147483647 when owner_plan = 'pro' then 25 else 5 end;
  select count(*) into current_count from public.challenge_members cm where cm.challenge_id = cid;
  if current_count >= member_limit then raise exception 'crew full'; end if;
  insert into public.challenge_members (challenge_id, user_id, role) values (cid, auth.uid(), 'member') on conflict do nothing;
  return cid;
end; $$;

revoke all on function public.join_public_challenge(text) from public;
grant execute on function public.join_public_challenge(text) to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();


create or replace function public.handle_new_challenge() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.challenge_members (challenge_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_challenge_created on public.challenges;
create trigger on_challenge_created after insert on public.challenges for each row execute procedure public.handle_new_challenge();

create index if not exists analytics_events_name_created_idx on public.analytics_events(event_name, created_at desc);
create index if not exists challenges_owner_idx on public.challenges(owner_id);
create index if not exists challenge_members_user_idx on public.challenge_members(user_id);
create index if not exists proofs_challenge_date_idx on public.proofs(challenge_id, proof_date desc);
create index if not exists proofs_user_date_idx on public.proofs(user_id, proof_date desc);

-- Private proof media. Files are served via short-lived signed URLs after proof-level RLS authorization.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proof-media', 'proof-media', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own proof media" on storage.objects;
create policy "users upload own proof media" on storage.objects for insert to authenticated
with check (bucket_id = 'proof-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own proof media" on storage.objects;
create policy "users delete own proof media" on storage.objects for delete to authenticated
using (bucket_id = 'proof-media' and (storage.foldername(name))[1] = auth.uid()::text);
