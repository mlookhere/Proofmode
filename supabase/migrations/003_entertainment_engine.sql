-- ProofMode 3.0 entertainment + social engine.
-- Run after 001_init.sql and 002_growth_engine.sql.

-- Black is an invite-only creator tier. Keep "pro" as the existing internal name for Proof+.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free','pro','creator','black'));

-- Expand challenge discovery taxonomy without breaking the v2 category names.
alter table public.challenges drop constraint if exists challenges_category_check;
alter table public.challenges add constraint challenges_category_check check (category in (
  'fitness','sports','build','work','business','creative','art','mind','study','social','food','outdoors','self_improvement','funny','other'
));

-- Update entitlement helpers so Black inherits Creator limits.
create or replace function public.challenge_configuration_allowed(target_visibility text, target_seat_cap int)
returns boolean language sql stable security definer set search_path = '' as $$
  select case coalesce((select p.plan from public.profiles p where p.id = auth.uid()), 'free')
    when 'black' then target_seat_cap is null or target_seat_cap <= 100000
    when 'creator' then target_seat_cap is null or target_seat_cap <= 100000
    when 'pro' then target_seat_cap is null or target_seat_cap <= 25
    else target_visibility <> 'private' and (target_seat_cap is null or target_seat_cap <= 5)
  end;
$$;

-- Media metadata. Actual bytes live in Cloudflare R2/Images or Stream.
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('r2','stream','supabase')),
  media_kind text not null check (media_kind in ('image','video')),
  storage_key text,
  playback_id text,
  public_url text,
  mime_type text,
  bytes bigint check (bytes is null or bytes >= 0),
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  processing_status text not null default 'pending' check (processing_status in ('pending','uploading','processing','ready','failed','deleted')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A Journey is a single user's attempt at a challenge.
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  attempt_no int not null default 1 check (attempt_no > 0),
  status text not null default 'active' check (status in ('active','completed','paused','ended')),
  visibility text not null default 'public' check (visibility in ('public','crew','private')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, challenge_id, attempt_no)
);

-- Public entertainment/content layer. Proof records remain the credibility ledger.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete set null,
  journey_id uuid references public.journeys(id) on delete set null,
  proof_id uuid references public.proofs(id) on delete set null,
  reply_to_post_id uuid references public.posts(id) on delete set null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  kind text not null default 'proof' check (kind in ('proof','fail','almost','comeback','pr','chaos','bts','reset')),
  caption text check (caption is null or char_length(caption) <= 1000),
  visibility text not null default 'public' check (visibility in ('public','crew','private')),
  status text not null default 'draft' check (status in ('draft','uploading','processing','moderation_pending','published','removed')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','review')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table if not exists public.watched_challenges (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('proven','respect','lol','run_it_back','im_next')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'published' check (status in ('published','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  interest text not null check (interest in ('fitness','sports','funny','food','build','business','art','study','outdoors','self_improvement')),
  created_at timestamptz not null default now(),
  primary key (user_id, interest)
);

create table if not exists public.challenge_templates (
  id text primary key,
  title text not null,
  promise text not null,
  category text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  duration_days int not null check (duration_days between 1 and 365),
  proof_method text not null,
  rule text not null,
  example_caption text,
  cover_emoji text,
  safety_note text,
  is_featured boolean not null default false,
  sort_rank int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user','challenge')),
  target_id text not null,
  reason text not null check (reason in ('spam','harassment','hate','dangerous','sexual','self_harm','illegal','impersonation','other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  target_type text not null,
  target_id text not null,
  action text not null check (action in ('none','warn','remove','suspend','ban','restore')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios','android','web')),
  token text not null unique,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  social boolean not null default true,
  drop_updates boolean not null default true,
  streak_risk boolean not null default true,
  crew_position boolean not null default true,
  journey_updates boolean not null default true,
  invites boolean not null default true,
  recap boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

-- Cheap, durable MVP background-work primitive. Service-role workers claim these rows.
-- This avoids adding a queue vendor before volume proves one is needed.
create table if not exists public.job_outbox (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('media_finalize','media_cleanup','moderation','push','email','receipt_render','analytics_rollup')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  status text not null default 'pending' check (status in ('pending','running','done','failed','dead')),
  run_after timestamptz not null default now(),
  attempts int not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for feed and social hot paths.
create index if not exists posts_published_created_idx on public.posts(status, visibility, published_at desc, id desc);
create index if not exists posts_user_created_idx on public.posts(user_id, created_at desc);
create index if not exists posts_challenge_created_idx on public.posts(challenge_id, created_at desc);
create index if not exists posts_journey_created_idx on public.posts(journey_id, created_at asc);
create index if not exists reactions_post_idx on public.post_reactions(post_id, created_at desc);
create index if not exists comments_post_created_idx on public.comments(post_id, created_at desc);
create index if not exists follows_followed_idx on public.follows(followed_id, created_at desc);
create index if not exists reports_status_created_idx on public.reports(status, created_at asc);
create index if not exists media_owner_created_idx on public.media_assets(owner_id, created_at desc);
create index if not exists job_outbox_pending_idx on public.job_outbox(status, run_after, id) where status in ('pending','failed');

-- RLS.
alter table public.media_assets enable row level security;
alter table public.journeys enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.watched_challenges enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comments enable row level security;
alter table public.user_interests enable row level security;
alter table public.challenge_templates enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.job_outbox enable row level security;

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when a is null or b is null then false else exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  ) end;
$$;

revoke all on function public.is_blocked_pair(uuid, uuid) from public;
grant execute on function public.is_blocked_pair(uuid, uuid) to anon, authenticated;

create or replace function public.can_view_post(target_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.posts p
    left join public.challenges c on c.id = p.challenge_id
    where p.id = target_post
      and p.status = 'published'
      and p.moderation_status = 'approved'
      and not public.is_blocked_pair(auth.uid(), p.user_id)
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or (p.visibility = 'crew' and p.challenge_id is not null and public.is_challenge_member(p.challenge_id))
      )
  );
$$;

revoke all on function public.can_view_post(uuid) from public;
grant execute on function public.can_view_post(uuid) to anon, authenticated;

-- Blocks.
create policy "blocker manages blocks" on public.blocks for all
using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Posts.
create policy "visible published posts" on public.posts for select
using (
  user_id = auth.uid()
  or (
    status = 'published'
    and moderation_status = 'approved'
    and not public.is_blocked_pair(auth.uid(), user_id)
    and (
      visibility = 'public'
      or (visibility = 'crew' and challenge_id is not null and public.is_challenge_member(challenge_id))
    )
  )
);

create policy "users create own posts" on public.posts for insert
with check (
  user_id = auth.uid()
  and status in ('draft','uploading','processing','moderation_pending')
  and moderation_status = 'pending'
  and (challenge_id is null or public.is_challenge_member(challenge_id) or public.is_challenge_owner(challenge_id))
  and (proof_id is null or exists (select 1 from public.proofs pr where pr.id = proof_id and pr.user_id = auth.uid()))
  and (journey_id is null or exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = auth.uid()))
  and (media_asset_id is null or exists (select 1 from public.media_assets ma where ma.id = media_asset_id and ma.owner_id = auth.uid()))
  and (reply_to_post_id is null or public.can_view_post(reply_to_post_id))
);

create policy "users update own unpublished posts" on public.posts for update
using (user_id = auth.uid() and status <> 'published')
with check (
  user_id = auth.uid()
  and status in ('draft','uploading','processing','moderation_pending')
  and moderation_status = 'pending'
  and (challenge_id is null or public.is_challenge_member(challenge_id) or public.is_challenge_owner(challenge_id))
  and (proof_id is null or exists (select 1 from public.proofs pr where pr.id = proof_id and pr.user_id = auth.uid()))
  and (journey_id is null or exists (select 1 from public.journeys j where j.id = journey_id and j.user_id = auth.uid()))
  and (media_asset_id is null or exists (select 1 from public.media_assets ma where ma.id = media_asset_id and ma.owner_id = auth.uid()))
  and (reply_to_post_id is null or public.can_view_post(reply_to_post_id))
);

create policy "users delete own posts" on public.posts for delete using (user_id = auth.uid());

-- Media metadata. Clients can read their own/visible media, but lifecycle and moderation
-- fields are server-owned. Create/update/delete records through the signed-upload/publish backend.
create policy "owners or public post viewers read media" on public.media_assets for select using (
  owner_id = auth.uid()
  or exists (select 1 from public.posts p where p.media_asset_id = id and public.can_view_post(p.id))
);

-- Journeys.
create policy "visible journeys" on public.journeys for select using (
  user_id = auth.uid()
  or (
    not public.is_blocked_pair(auth.uid(), user_id)
    and (
      visibility = 'public'
      or (visibility = 'crew' and public.is_challenge_member(challenge_id))
    )
  )
);
create policy "users create own journeys" on public.journeys for insert with check (
  user_id = auth.uid() and (public.is_challenge_member(challenge_id) or public.is_challenge_owner(challenge_id))
);
create policy "users update own journeys" on public.journeys for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Follows.
create policy "users read own follow graph" on public.follows for select using (follower_id = auth.uid() or followed_id = auth.uid());
create policy "users follow" on public.follows for insert with check (follower_id = auth.uid() and not public.is_blocked_pair(follower_id, followed_id));
create policy "users unfollow" on public.follows for delete using (follower_id = auth.uid());

-- Watch Drop.
create policy "users read own watched drops" on public.watched_challenges for select using (user_id = auth.uid());
create policy "users watch drops" on public.watched_challenges for insert with check (user_id = auth.uid());
create policy "users unwatch drops" on public.watched_challenges for delete using (user_id = auth.uid());

-- Reactions.
create policy "view reactions on visible posts" on public.post_reactions for select using (public.can_view_post(post_id));
create policy "users react" on public.post_reactions for insert with check (user_id = auth.uid() and public.can_view_post(post_id));
create policy "users change own reaction" on public.post_reactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users remove own reaction" on public.post_reactions for delete using (user_id = auth.uid());

-- Comments.
create policy "view comments on visible posts" on public.comments for select using (status = 'published' and public.can_view_post(post_id));
create policy "users comment" on public.comments for insert with check (user_id = auth.uid() and status = 'published' and public.can_view_post(post_id));
create policy "users update own live comments" on public.comments for update
using (user_id = auth.uid() and status = 'published')
with check (user_id = auth.uid() and status = 'published');
create policy "users delete own comments" on public.comments for delete using (user_id = auth.uid());

-- Interests.
create policy "users read own interests" on public.user_interests for select using (user_id = auth.uid());
create policy "users add own interests" on public.user_interests for insert with check (user_id = auth.uid());
create policy "users remove own interests" on public.user_interests for delete using (user_id = auth.uid());

-- Templates are public read, server/admin write.
create policy "templates public read" on public.challenge_templates for select using (true);

-- Reports are private to reporter; moderation uses service role/admin backend.
create policy "users submit reports" on public.reports for insert with check (reporter_id = auth.uid());
create policy "users read own reports" on public.reports for select using (reporter_id = auth.uid());

-- No client policy for moderation_actions by design.

-- Push tokens/preferences.
create policy "users manage own push tokens" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users read own notification prefs" on public.notification_preferences for select using (user_id = auth.uid());
create policy "users create own notification prefs" on public.notification_preferences for insert with check (user_id = auth.uid());
create policy "users update own notification prefs" on public.notification_preferences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lightweight feed RPC. Ranking is intentionally deterministic for MVP.
create or replace function public.get_feed_v1(max_items int default 20, before_time timestamptz default null)
returns table (
  post_id uuid,
  kind text,
  caption text,
  published_at timestamptz,
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  challenge_id uuid,
  challenge_slug text,
  challenge_title text,
  journey_id uuid,
  proof_id uuid,
  media_id uuid,
  media_kind text,
  media_provider text,
  media_public_url text,
  media_playback_id text,
  reaction_count bigint,
  comment_count bigint,
  score numeric
) language sql stable security definer set search_path = '' as $$
  with candidates as (
    select p.*,
      coalesce((select count(*) from public.post_reactions r where r.post_id = p.id), 0) as reactions,
      coalesce((select count(*) from public.comments c where c.post_id = p.id and c.status = 'published'), 0) as comments
    from public.posts p
    where p.status = 'published'
      and p.moderation_status = 'approved'
      and p.visibility = 'public'
      and (before_time is null or p.published_at < before_time)
      and not public.is_blocked_pair(auth.uid(), p.user_id)
    order by p.published_at desc nulls last, p.id desc
    limit greatest(1, least(max_items * 5, 200))
  )
  select
    p.id,
    p.kind,
    p.caption,
    p.published_at,
    p.user_id,
    pr.handle,
    pr.display_name,
    pr.avatar_url,
    p.challenge_id,
    ch.slug,
    ch.title,
    p.journey_id,
    p.proof_id,
    m.id,
    m.media_kind,
    m.provider,
    m.public_url,
    m.playback_id,
    p.reactions,
    p.comments,
    (
      p.reactions * 2
      + p.comments * 3
      + case when exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followed_id = p.user_id) then 25 else 0 end
      + case when p.challenge_id is not null and exists (select 1 from public.watched_challenges w where w.user_id = auth.uid() and w.challenge_id = p.challenge_id) then 15 else 0 end
      + case when ch.category is not null and exists (select 1 from public.user_interests ui where ui.user_id = auth.uid() and ui.interest = ch.category) then 10 else 0 end
      - extract(epoch from (now() - coalesce(p.published_at, p.created_at))) / 86400.0
    )::numeric as score
  from candidates p
  left join public.profiles pr on pr.id = p.user_id
  left join public.challenges ch on ch.id = p.challenge_id
  left join public.media_assets m on m.id = p.media_asset_id
  where m.id is null or (m.processing_status = 'ready' and m.moderation_status = 'approved')
  order by score desc, p.published_at desc
  limit greatest(1, least(max_items, 50));
$$;

grant execute on function public.get_feed_v1(int, timestamptz) to anon, authenticated;

-- Helpful public Journey snapshot for binge pages.
create or replace function public.get_journey_posts(target_journey uuid)
returns table (
  post_id uuid,
  kind text,
  caption text,
  published_at timestamptz,
  proof_id uuid,
  media_kind text,
  media_public_url text,
  media_playback_id text
) language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.caption, p.published_at, p.proof_id,
         m.media_kind, m.public_url, m.playback_id
  from public.posts p
  left join public.media_assets m on m.id = p.media_asset_id
  where p.journey_id = target_journey and public.can_view_post(p.id)
  order by p.published_at asc nulls last, p.created_at asc;
$$;

grant execute on function public.get_journey_posts(uuid) to anon, authenticated;

-- Starter template set. Expand to ~60 curated templates before public launch.
insert into public.challenge_templates (id,title,promise,category,difficulty,duration_days,proof_method,rule,example_caption,cover_emoji,safety_note,is_featured,sort_rank) values
('run-mile','Run 1 Mile','One mile. Every day. No overthinking.','fitness','easy',7,'photo or activity screenshot','Complete at least one mile of running or run/walk each day.','Day 1. Starting ugly. 🏃','🏃','Adjust for your fitness level and stop for pain.',true,10),
('walk-10k','10K Steps','Get outside and stack ten thousand.','fitness','easy',14,'step screenshot','Reach 10,000 steps during the day.','Touching grass, aggressively.','👟','Choose a lower target if medically appropriate.',true,20),
('pushups-20','20 Pushups','A tiny daily test that compounds.','fitness','easy',14,'short video or photo','Complete 20 pushups, modified as needed.','Twenty done. Your turn.','💪','Use a safe variation for your ability.',true,30),
('cook-home','Cook at Home','Make one meal instead of ordering it.','food','easy',7,'meal photo','Prepare at least one meal at home.','No delivery app was harmed today.','🍳',null,true,40),
('new-food','Try One New Food','One new bite a day.','food','easy',7,'food photo','Try a food or dish you have not tried before.','I regret nothing. Probably.','🥟','Respect allergies and dietary restrictions.',false,50),
('read-20','Read 20 Pages','Twenty pages before the day gets you.','study','easy',14,'book/page photo','Read at least 20 pages of a book.','Twenty pages > twenty tabs.','📚',null,true,60),
('study-45','45 Minute Lock-In','One distraction-free study block.','study','medium',14,'desk/timer photo','Complete one focused 45-minute study session.','Locked in. Phone lost.','🧠','Take breaks and maintain healthy sleep.',true,70),
('ship-daily','Ship One Thing','Make something real every day.','build','medium',14,'link, screenshot or photo','Publish, deploy, send or complete one tangible unit of work.','Less planning. More shipping.','🚀',null,true,80),
('customer-talk','Talk to One Customer','Get one real conversation every day.','business','medium',7,'note/screenshot without private data','Have one substantive customer/prospect conversation.','One conversation closer to reality.','☎️','Do not post private customer information.',false,90),
('sales-20','20 Sales Calls','Do the reps.','business','hard',7,'call-log screenshot with private data hidden','Complete 20 legitimate outbound sales calls.','20 calls. Some pain. Some progress.','📞','Hide phone numbers and personal information.',false,100),
('sketch-daily','One Sketch','One page. No perfection required.','art','easy',14,'art photo','Make one original sketch each day.','Not perfect. Still posted.','✏️',null,true,110),
('photo-daily','One Photo','Find one frame worth keeping.','art','easy',30,'photo','Take and post one original photo.','Today looked like this.','📸','Respect people’s privacy when photographing.',false,120),
('touch-grass','Touch Grass','Actually go outside.','outdoors','easy',7,'outdoor photo','Spend meaningful time outdoors each day.','Internet survived without me.','🌱','Choose safe locations and conditions.',true,130),
('sunrise','Catch a Sunrise','Be there before the day starts.','outdoors','medium',7,'sunrise photo','Watch or photograph sunrise from a safe place.','Worth the alarm. Barely.','🌅','Do not drive or hike unsafely while tired.',false,140),
('no-doordash','No Delivery Week','Cook, pick up, or figure it out.','food','medium',7,'meal/receipt photo','Do not order meal delivery for the challenge period.','Saved the fees. Spent them on groceries.','🛒',null,true,150),
('desk-reset','Reset Your Desk','End the day ready for tomorrow.','self_improvement','easy',7,'desk photo','Reset your main work/study space once per day.','Future me is weirdly grateful.','🧹',null,false,160),
('water-break','Water Before Soda','One simple swap each day.','self_improvement','easy',14,'photo','Choose water for one habitual sugary-drink occasion each day.','The most boring win possible.','💧','Not medical advice; hydrate appropriately.',false,170),
('friend-laugh','Make a Friend Laugh','Create one tiny good moment.','funny','easy',7,'caption/photo with consent','Make someone you know laugh and post the story without exposing private info.','Mission accomplished 😂','😂','Get consent before posting other people.',true,180),
('bad-cooking','Cook Without Panicking','Try a recipe and post the chaos too.','funny','medium',7,'photo/video','Cook something new; success and failure both count as content, but completed cooking counts as proof.','Smoke alarm: 1. Me: 0.','🔥','Use normal kitchen/fire safety.',true,190),
('declutter-10','Declutter 10','Remove ten unnecessary items.','self_improvement','easy',7,'before/after photo','Put away, donate or discard ten items.','Ten fewer things judging me.','📦',null,false,200),
('learn-15','Learn 15 Minutes','Tiny learning, every day.','study','easy',30,'notes/timer photo','Spend at least 15 focused minutes learning a skill.','Day one of being slightly less clueless.','🧩',null,true,210),
('write-500','Write 500 Words','Make the blank page lose.','art','medium',14,'word-count screenshot','Write at least 500 original words.','500 words. Some even survived editing.','⌨️',null,true,220),
('mobility-10','10 Minute Mobility','Move better for ten minutes.','fitness','easy',14,'photo/timer','Complete a safe 10-minute mobility routine.','Ten minutes invested.','🧘','Avoid painful ranges of motion.',false,230),
('stairs','Take the Stairs','Choose the harder little option.','fitness','easy',7,'photo','Choose stairs for one safe, reasonable trip each day when available.','Small reps count.','🪜','Use elevators when stairs are unsafe or inaccessible.',false,240)
on conflict (id) do update set
  title = excluded.title,
  promise = excluded.promise,
  category = excluded.category,
  difficulty = excluded.difficulty,
  duration_days = excluded.duration_days,
  proof_method = excluded.proof_method,
  rule = excluded.rule,
  example_caption = excluded.example_caption,
  cover_emoji = excluded.cover_emoji,
  safety_note = excluded.safety_note,
  is_featured = excluded.is_featured,
  sort_rank = excluded.sort_rank;
