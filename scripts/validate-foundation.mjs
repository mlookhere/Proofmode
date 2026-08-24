import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const requireAll = (source, values, label) => {
  for (const value of values) assert(source.includes(value), `${label} is missing: ${value}`);
};

const migrations = (await readdir(resolve(root, "supabase/migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
assert(JSON.stringify(migrations) === JSON.stringify([
  "001_init.sql",
  "002_growth_engine.sql",
  "003_entertainment_engine.sql",
  "004_template_library.sql",
  "005_feed_pagination.sql",
  "006_staging_hardening.sql",
  "007_client_acl_parity.sql",
  "008_media_post_lifecycle.sql",
  "009_feed_publication_time_guard.sql",
  "010_social_actions.sql",
  "011_social_unblock_visibility.sql",
  "012_social_read_privacy.sql",
  "013_social_rpc_boundary.sql",
  "014_social_performance_hardening.sql",
  "015_journey_proof_passport.sql",
  "016_cross_layer_integration_hardening.sql",
]), `Unexpected migration set: ${migrations.join(", ")}`);

const templatesSql = await read("supabase/migrations/004_template_library.sql");
assert(templatesSql.split("\n").filter((line) => line.startsWith("('")).length === 60, "Expected 60 launch templates");

const hardeningSql = await read("supabase/migrations/006_staging_hardening.sql");
for (const staleTemplate of ["declutter-10", "desk-reset", "no-doordash", "stairs", "water-break"]) {
  assert(hardeningSql.includes(`'${staleTemplate}'`), `Missing stale template cleanup: ${staleTemplate}`);
}
requireAll(hardeningSql, [
  "alter function public.is_challenge_member(uuid) set schema private",
  "drop function if exists public.join_public_challenge(text)",
  "to service_role",
], "Staging hardening");

const clientAclSql = await read("supabase/migrations/007_client_acl_parity.sql");
requireAll(clientAclSql, [
  "grant select on table public.challenges to anon, authenticated",
  "grant select on table public.challenge_members to authenticated",
  "grant select, insert, delete on table public.watched_challenges to authenticated",
  "grant select on table public.profiles to authenticated",
], "Client ACL migration");

const mediaLifecycle = await read("supabase/migrations/008_media_post_lifecycle.sql");
requireAll(mediaLifecycle, [
  "posts_media_asset_unique_idx",
  "revoke insert, update, delete on table public.media_assets from anon, authenticated",
  "private.sync_media_post_lifecycle",
  "moderation:media:",
  "status = 'published'",
  "status = 'removed'",
  "status = 'draft'",
], "Media lifecycle migration");

const entertainmentSql = await read("supabase/migrations/003_entertainment_engine.sql");
requireAll(entertainmentSql, [
  "create or replace function public.get_feed_v1",
  "alter table public.posts enable row level security",
  "alter table public.media_assets enable row level security",
], "Entertainment migration");

const paginationSql = await read("supabase/migrations/005_feed_pagination.sql");
requireAll(paginationSql, ["cursor_score", "cursor_time", "cursor_post_id"], "Feed pagination");
assert(paginationSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Feed cursor does not match ordering");
assert(!paginationSql.includes("now() - p.published_at"), "Feed cursor score must not drift between page requests");

const publicationGuardSql = await read("supabase/migrations/009_feed_publication_time_guard.sql");
requireAll(publicationGuardSql, ["and p.published_at <= now()", "cursor_score", "cursor_time", "cursor_post_id"], "Publication guard");
assert(publicationGuardSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Publication guard changed feed ordering");
assert(!publicationGuardSql.includes("now() - p.published_at"), "Publication guard must preserve deterministic feed score");

const socialSql = await read("supabase/migrations/010_social_actions.sql");
requireAll(socialSql, [
  "create table if not exists public.crew_messages",
  "public.set_follow_v1",
  "public.set_post_reaction_v1",
  "public.create_comment_v1",
  "public.delete_comment_v1",
  "public.set_block_v1",
  "public.submit_report_v1",
  "public.get_post_comments_v1",
  "public.get_my_crews_v1",
  "public.get_crew_room_v1",
  "public.post_crew_message_v1",
  "public.delete_crew_message_v1",
  "public.create_crew_invite_v1",
  "viewer_follows",
  "viewer_reaction",
  "and p.published_at <= now()",
  "private.is_blocked_pair",
  "private.can_view_post",
  "cursor_score",
  "cursor_time",
  "cursor_post_id",
], "Social migration");
for (const reaction of ["proven", "respect", "lol", "run_it_back", "im_next"]) {
  assert(socialSql.includes(`'${reaction}'`), `Social migration is missing reaction: ${reaction}`);
}
assert(socialSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Social feed override changed cursor ordering");
assert(!socialSql.includes("now() - p.published_at"), "Social feed override must preserve deterministic score");

const unblockSql = await read("supabase/migrations/011_social_unblock_visibility.sql");
assert(unblockSql.includes("public.get_my_blocks_v1"), "Blocked-user read RPC is missing");
for (const table of ["follows", "post_reactions", "comments", "blocks", "reports", "crew_messages"]) {
  assert(unblockSql.includes(`revoke insert, update, delete on table public.${table} from anon, authenticated`), `Social writes are not RPC-only for ${table}`);
}

const socialPrivacySql = await read("supabase/migrations/012_social_read_privacy.sql");
requireAll(socialPrivacySql, [
  "create or replace function public.get_my_crews_v1",
  "create or replace function public.get_crew_room_v1",
  "not private.is_blocked_pair(auth.uid(), all_members.user_id)",
  "not private.is_blocked_pair(auth.uid(), pr.user_id)",
  "not private.is_blocked_pair(auth.uid(), r.user_id)",
  "p.status = 'published'",
  "p.moderation_status = 'approved'",
  "p.published_at <= now()",
  "private.can_view_post(p.id)",
  "viewer_follows",
  "viewer_reaction",
  "cursor_score",
  "cursor_time",
  "cursor_post_id",
], "Social privacy migration");
assert(socialPrivacySql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Social privacy feed changed cursor ordering");
assert(!socialPrivacySql.includes("now() - p.published_at"), "Social privacy feed must preserve deterministic score");

const rpcBoundarySql = await read("supabase/migrations/013_social_rpc_boundary.sql");
const privilegedSocialFunctions = [
  "set_follow_v1(uuid, boolean)",
  "set_post_reaction_v1(uuid, text)",
  "create_comment_v1(uuid, text)",
  "delete_comment_v1(uuid)",
  "set_block_v1(uuid, boolean)",
  "submit_report_v1(text, uuid, text, text)",
  "get_post_comments_v1(uuid, int)",
  "get_my_crews_v1()",
  "get_crew_room_v1(uuid)",
  "post_crew_message_v1(uuid, text)",
  "delete_crew_message_v1(uuid)",
  "create_crew_invite_v1(uuid)",
  "get_my_blocks_v1()",
];
for (const signature of privilegedSocialFunctions) {
  assert(rpcBoundarySql.includes(`alter function public.${signature} set schema private`), `Social RPC implementation remains exposed: ${signature}`);
}
requireAll(rpcBoundarySql, [
  "security invoker set search_path = ''",
  "select private.set_follow_v1",
  "select private.set_post_reaction_v1",
  "select private.create_comment_v1",
  "select private.set_block_v1",
  "select private.submit_report_v1",
  "select * from private.get_post_comments_v1",
  "select * from private.get_my_crews_v1",
  "select private.get_crew_room_v1",
  "select private.post_crew_message_v1",
  "select * from private.get_my_blocks_v1",
], "Social RPC boundary");

const socialPerformanceSql = await read("supabase/migrations/014_social_performance_hardening.sql");
requireAll(socialPerformanceSql, [
  "crew_messages_user_idx",
  "private.is_blocked_pair((select auth.uid()), user_id)",
  "user_id = (select auth.uid())",
  "id = (select auth.uid())",
], "Social performance hardening");

const journeySql = await read("supabase/migrations/015_journey_proof_passport.sql");
requireAll(journeySql, [
  "journeys_active_user_challenge_idx",
  "journeys_attempt_token_idx",
  "proofs_post_unique_idx",
  "create table if not exists public.journey_follows",
  "alter table public.journey_follows enable row level security",
  'drop policy if exists "visible journeys" on public.journeys',
  "private.can_view_journey_v1",
  "private.ensure_journey_v1",
  "private.reset_journey_v1",
  "private.set_journey_follow_v1",
  "private.set_proof_verification_v1",
  "private.sync_published_post_proof_v1",
  "new.kind not in ('proof', 'comeback', 'pr')",
  "private.get_journey_snapshot_v1",
  "private.get_profile_snapshot_v2",
  "alter function public.get_journey_posts(uuid) set schema private",
  "security invoker set search_path = ''",
  "select private.ensure_journey_v1",
  "select private.reset_journey_v1",
  "select private.set_proof_verification_v1",
], "Journey/Passport migration");
for (const table of ["journeys", "journey_follows", "proofs", "verifications"]) {
  assert(journeySql.includes(`revoke insert, update, delete on table public.${table} from anon, authenticated`), `Journey credibility writes are not RPC-only for ${table}`);
}
const legacyJourneyWrapper = journeySql.slice(
  journeySql.indexOf("create function public.get_journey_posts(target_journey uuid)"),
  journeySql.indexOf("-- Replace the old public profile definer"),
);
for (const field of ["post_id uuid", "kind text", "caption text", "published_at timestamptz", "proof_id uuid", "media_kind text", "media_public_url text", "media_playback_id text"]) {
  assert(legacyJourneyWrapper.includes(field), `Legacy Journey wrapper lost field: ${field}`);
}
for (const changedField of ["user_id uuid", "handle text", "challenge_id uuid"]) {
  assert(!legacyJourneyWrapper.includes(changedField), `Legacy Journey wrapper unexpectedly changed shape: ${changedField}`);
}

const integrationSql = await read("supabase/migrations/016_cross_layer_integration_hardening.sql");
requireAll(integrationSql, [
  "revoke insert, update, delete on table public.posts from anon, authenticated",
  'drop policy if exists "users create own posts" on public.posts',
  'drop policy if exists "users update own unpublished posts" on public.posts',
  'drop policy if exists "users delete own posts" on public.posts',
  "private.assign_post_journey_v1",
  "assigned_journey_id := private.reset_journey_v1",
  "assigned_journey_id := private.ensure_journey_v1",
  "set journey_id = assigned_journey_id",
  "alter function public.get_challenge_landing(text, text) set schema private",
  "alter function public.get_feed_v1(integer, numeric, timestamptz, uuid) set schema private",
  "alter function public.get_public_challenge_snapshot(text) set schema private",
  "alter function public.join_challenge_v2(text, text) set schema private",
  "owner_plan in ('creator', 'black')",
  "security invoker",
  "select private.join_challenge_v2",
  "select * from private.get_feed_v1",
], "Cross-layer hardening migration");

const mobilePackage = JSON.parse(await read("mobile/package.json"));
const mobileLock = JSON.parse(await read("mobile/package-lock.json"));
const mobileAppConfig = JSON.parse(await read("mobile/app.json")).expo;
assert(mobilePackage.version === "0.9.0" && mobileAppConfig.version === "0.9.0", "Mobile v0.9.0 versions are not synchronized");
assert(mobileLock.version === "0.9.0" && mobileLock.packages?.[""]?.version === "0.9.0", "Mobile lockfile version is stale");
assert(mobilePackage.dependencies?.expo?.startsWith("~57."), "Mobile must remain on Expo SDK 57");
assert(mobilePackage.engines?.node === ">=22.13.0", "Mobile Node baseline must remain >=22.13.0");
for (const dependency of [
  "@supabase/supabase-js",
  "@react-native-async-storage/async-storage",
  "react-native-url-polyfill",
  "expo-file-system",
  "expo-image-picker",
  "expo-video",
]) {
  assert(mobilePackage.dependencies?.[dependency], `Missing mobile dependency: ${dependency}`);
  assert(mobileLock.packages?.[""]?.dependencies?.[dependency], `Mobile lockfile is missing: ${dependency}`);
}

const rootPackage = JSON.parse(await read("package.json"));
for (const dependency of ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"]) {
  assert(rootPackage.dependencies?.[dependency], `Missing web media dependency: ${dependency}`);
}

const supabaseClient = await read("mobile/src/lib/supabase.ts");
assert(supabaseClient.includes("persistSession: true") && supabaseClient.includes("storage: AsyncStorage"), "Mobile auth persistence is incomplete");
const rootLayout = await read("mobile/app/_layout.tsx");
assert(rootLayout.includes("<AuthProvider>"), "Mobile root is missing AuthProvider");

const mobileFeed = await read("mobile/src/api/feed.ts");
requireAll(mobileFeed, ['rpc("get_feed_v1"', "cursor_post_id", "media_public_url", "media_kind", "viewer_follows", "viewer_reaction", "journey_id", "journeyId"], "Mobile feed");
const mobileHome = await read("mobile/app/(tabs)/index.tsx");
requireAll(mobileHome, ["onEndReached", "onViewableItemsChanged", "activePostId", "useFocusEffect", "feedFocused && activePostId", 'media?.kind === "video"', "hideBlockedUser"], "Mobile Home");
const feedCard = await read("mobile/src/components/feed-card.tsx");
requireAll(feedCard, ["VideoView", "useVideoPlayer", "<Image", "setFollow", "PostSocialModal", "Could not update follow", "item.journeyId", "/journey/"], "Feed card");

const mobileSocial = await read("mobile/src/api/social.ts");
for (const rpc of [
  "set_follow_v1",
  "set_post_reaction_v1",
  "get_post_comments_v1",
  "create_comment_v1",
  "delete_comment_v1",
  "set_block_v1",
  "submit_report_v1",
  "get_my_crews_v1",
  "get_crew_room_v1",
  "post_crew_message_v1",
  "delete_crew_message_v1",
  "create_crew_invite_v1",
  "get_my_blocks_v1",
]) assert(mobileSocial.includes(`"${rpc}"`), `Mobile social API is missing ${rpc}`);
const postSocialModal = await read("mobile/src/components/post-social-modal.tsx");
requireAll(postSocialModal, ["reactionKinds.map", "fetchPostComments", 'openReport("comment"', 'openReport("post"', 'openReport("user"', "setBlock", "BLOCK USER"], "Post social modal");
const reportModal = await read("mobile/src/components/report-modal.tsx");
requireAll(reportModal, ["reportReasons.map", "submitReport"], "Report modal");

const mobileCrews = await read("mobile/app/(tabs)/crews.tsx");
const mobileCrewRoom = await read("mobile/app/crew/[id].tsx");
requireAll(mobileCrews, ["fetchMyCrews", "/crew/"], "Crews tab");
requireAll(mobileCrewRoom, ["fetchCrewRoom", "postCrewMessage", "deleteCrewMessage", "createCrewInvite", "leaderboard", "recent_activity", "messages"], "Crew room");

const mobileJourney = await read("mobile/src/api/journey.ts");
for (const rpc of ["get_journey_snapshot_v1", "get_my_journey_for_drop_v1", "ensure_journey_v1", "reset_journey_v1", "set_journey_follow_v1", "set_proof_verification_v1"]) {
  assert(mobileJourney.includes(`"${rpc}"`), `Mobile Journey API is missing ${rpc}`);
}
const mobileJourneyRoute = await read("mobile/app/journey/[id].tsx");
requireAll(mobileJourneyRoute, ["fetchJourneySnapshot", "setJourneyFollow", "setProofVerification", "RUN IT BACK", "START FROM DAY 1", "JOIN SAME DROP", "verified_count", "current_streak", "best_streak"], "Journey route");

const mobileYou = await read("mobile/app/(tabs)/you.tsx");
requireAll(mobileYou, ["fetchMyBlocks", "UNBLOCK", "setBlock", "PROOF SCORE", "DROPS DONE", "CURRENT STREAK", "BEST STREAK", "COMEBACKS", "ACTIVE JOURNEYS", "TROPHY CASE", "RECENT POSTS", "/journey/"], "Passport/blocked-user management");
const mobileProfile = await read("mobile/src/api/profile.ts");
requireAll(mobileProfile, ["completed_drops", "current_streak", "best_streak", "comeback_count", "active_journeys", "trophy_case", "recent_posts", '"black"'], "Passport API");

const mobileChallenges = await read("mobile/src/api/challenges.ts");
const mobileExplore = await read("mobile/app/(tabs)/explore.tsx");
const mobileChallengeRoute = await read("mobile/app/challenge/[slug].tsx");
requireAll(mobileChallenges, ['.from("challenges")', 'rpc("join_challenge_v2"', "fetchJoinedPublicChallenges"], "Mobile challenges");
requireAll(mobileExplore, ["fetchPublicChallenges", "/challenge/"], "Mobile Explore");
requireAll(mobileChallengeRoute, ['runAction("join")', 'runAction("watch")', "ReportModal", "REPORT DROP", "fetchMyJourneyForDrop", "ensureJourney", "CONTINUE JOURNEY", "START JOURNEY"], "Challenge route");

const mobileCreate = await read("mobile/app/(tabs)/create.tsx");
requireAll(mobileCreate, ["launchCameraAsync", "launchImageLibraryAsync", "MAX_VIDEO_SECONDS", "loadPendingUpload", "retryPendingUpload", "createResetToken", "resetToken", "discardUploadIntent", "POST {mode.toUpperCase()}"], "Mobile Create");
assert(mobileCreate.includes("const userId = session?.user.id") && mobileCreate.includes("setChallengeId(joined[0]?.id || \"\")"), "Composer state is not reset safely across account changes");
const mobileMedia = await read("mobile/src/api/media.ts");
requireAll(mobileMedia, ["createUploadTask", "BINARY_CONTENT", "MULTIPART", "proofmode.pending-media-upload.v3", "LEGACY_PENDING_UPLOAD_V2_PREFIX", "resetToken", "discardUploadIntent", "/api/media/upload-intent", "/api/media/finalize"], "Mobile media client");
assert(mobileMedia.includes("pendingUploadKey(userId)") && mobileMedia.includes("pending.userId !== currentUserId"), "Interrupted upload state is not account scoped");
assert(!/SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_[A-Z_]+/.test(mobileMedia), "Server media credentials leaked into mobile code");

for (const route of [
  "app/api/media/upload-intent/route.ts",
  "app/api/media/finalize/route.ts",
  "app/api/media/stream/webhook/route.ts",
  "app/api/media/assets/[mediaId]/route.ts",
  "app/api/media/cleanup/route.ts",
]) await read(route);
const mediaServer = await read("lib/media/server.ts");
requireAll(mediaServer, ["requireBearerUser", "bearerClient", "SUPABASE_SERVICE_ROLE_KEY", "getSignedUrl", "timingSafeEqual", "MAX_VIDEO_BYTES", "MAX_VIDEO_SECONDS"], "Media backend");
assert(mediaServer.includes("challenges!inner(visibility,format)") && mediaServer.includes('challenge?.format !== "drop"'), "Media authorization does not require a public Drop");
const uploadIntent = await read("app/api/media/upload-intent/route.ts");
requireAll(uploadIntent, ["assertPublicChallengeMembership", "assertUploadRate", "RECOVERABLE_MEDIA_STATES", "Upload is no longer in a retryable state", "playback_id: direct.uid", "playback_id: previousUid", "bearerClient", 'rpc("assign_post_journey_v1"', "journey_id: null", "assignPostJourney", "resetToken", "post.journey_id"], "Upload intent");
assert(!uploadIntent.includes('rpc("ensure_journey_v1"') && !uploadIntent.includes('rpc("reset_journey_v1"'), "Upload intent can mutate Journey state before its post exists");
const finalize = await read("app/api/media/finalize/route.ts");
assert(finalize.includes("assertPublicChallengeMembership") && finalize.includes("initialPost.challenge_id"), "Finalize does not reauthorize current Drop membership");
assert(finalize.includes('asset.processing_status === "deleted"'), "Finalize can revive discarded media");
const streamWebhook = await read("app/api/media/stream/webhook/route.ts");
requireAll(streamWebhook, ["verifyStreamWebhook", 'processing_status: "ready"', 'asset.processing_status === "deleted"', 'asset.processing_status === "ready"'], "Stream webhook");
const cleanup = await read("app/api/media/cleanup/route.ts");
assert(cleanup.includes("CRON_SECRET") && cleanup.includes('processing_status: "deleted"'), "Media cleanup is not protected or stateful");
assert(cleanup.includes('["pending", "uploading", "processing", "failed"]'), "Cleanup does not recover stuck processing uploads");

const legacyProofRoute = await read("app/api/proofs/route.ts");
requireAll(legacyProofRoute, ['rpc("create_legacy_proof_v1"', "target_media_url", "proofId"], "Legacy proof route");
assert(!legacyProofRoute.includes('.from("proofs").insert'), "Legacy proof route can still bypass proof RPC");
const verificationRoute = await read("app/api/verifications/route.ts");
requireAll(verificationRoute, ['rpc("set_proof_verification_v1"', "target_proof", "target_verdict", 'typeof body.verdict !== "boolean"'], "Verification route");
assert(!verificationRoute.includes('.from("verifications").upsert'), "Verification route can still bypass verification RPC");
const challengeRoute = await read("app/api/challenges/route.ts");
assert(challengeRoute.includes('plan === "creator" || plan === "black" ? 100000'), "Web challenge capacity does not treat Black as Creator+");

const vercel = JSON.parse(await read("vercel.json"));
assert(vercel.crons?.some((cron) => cron.path === "/api/media/cleanup"), "Vercel media cleanup cron is missing");

assert(mobileAppConfig?.scheme === "proofmode", "Missing proofmode app scheme");
assert(mobileAppConfig?.ios?.associatedDomains?.includes("applinks:proofmode.app"), "Missing iOS associated domain");
assert(mobileAppConfig?.android?.intentFilters?.some((filter) => filter.action === "VIEW"), "Missing Android app-link intent filter");
assert(mobileAppConfig?.plugins?.some((plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker"), "Image picker permissions are not configured");

const supabaseConfig = await read("supabase/config.toml");
assert(supabaseConfig.includes('project_id = "proofmode"'), "Supabase local project config is missing");
assert(supabaseConfig.includes('additional_redirect_urls = ["proofmode://auth"]'), "Local magic-link redirect allowlist is missing");

for (const testFile of [
  "supabase/tests/database/001_schema_auth.test.sql",
  "supabase/tests/database/002_rls.test.sql",
  "supabase/tests/database/003_security_hardening.test.sql",
  "supabase/tests/database/004_media_lifecycle.test.sql",
  "supabase/tests/database/005_social_actions.test.sql",
  "supabase/tests/database/006_journey_proof_passport.test.sql",
  "supabase/tests/database/007_cross_layer_integration_hardening.test.sql",
  "supabase/tests/local/003_feed_pagination.test.sql",
]) {
  const sql = await read(testFile);
  const plan = Number(sql.match(/select\s+plan\((\d+)\)/i)?.[1]);
  const assertions = (sql.match(/select\s+(?:ok|is|throws_ok|throws_like|lives_ok)\s*\(/gi) ?? []).length;
  assert(Number.isInteger(plan) && plan === assertions, `pgTAP plan mismatch in ${testFile}: plan=${plan}, assertions=${assertions}`);
  assert(sql.includes("select * from finish()") && sql.trimEnd().endsWith("rollback;"), `Invalid transactional pgTAP file: ${testFile}`);
}

const journeyTest = await read("supabase/tests/database/006_journey_proof_passport.test.sql");
requireAll(journeyTest, ["select plan(50)", "only one active Journey exists", "Reset retry cannot manufacture attempts", "Fail never becomes a proof receipt", "Almost never becomes a proof receipt", "Reset never becomes a proof receipt", "broken streak preserves best historical run", "challenge membership required", "paid/status plan cannot change Proof Score", "blocking severs Journey follows"], "Journey pgTAP");
const integrationTest = await read("supabase/tests/database/007_cross_layer_integration_hardening.test.sql");
requireAll(integrationTest, ["select plan(25)", "direct post insert is denied", "forced post-link failure aborts Reset assignment", "failed post link rolls back the new Reset attempt", "Black-owned Drop accepts member six", "anonymous public read RPC access is preserved"], "Integration hardening pgTAP");

const ci = await read(".github/workflows/ci.yml");
requireAll(ci, ["supabase/setup-cli@v2", "supabase start", "supabase db lint --level error --fail-on error", "supabase test db supabase/tests/database supabase/tests/local"], "CI database gate");

const mobileAuth = await read("mobile/app/auth.tsx");
const mobileDeepLink = await read("mobile/src/auth/deep-link.ts");
const mobileSession = await read("mobile/src/auth/session.tsx");
assert(mobileAuth.includes("signInWithOtp") && !mobileAuth.includes("signInWithPassword"), "Magic-link auth contract regressed");
assert(mobileDeepLink.includes('authRedirectUrl = "proofmode://auth"') && mobileDeepLink.includes("buildAuthRedirectUrl"), "Magic-link redirect contract regressed");
assert(mobileDeepLink.includes("auth.setSession") || mobileDeepLink.includes(".auth.setSession"), "Magic-link session completion is missing");
assert(mobileSession.includes("Linking.getInitialURL") && mobileSession.includes('Linking.addEventListener("url"'), "Auth deep links are incomplete");

const mobileEnv = await read("mobile/.env.example");
for (const key of ["EXPO_PUBLIC_APP_ENV", "EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
  assert(mobileEnv.includes(`${key}=`), `Missing ${key} from mobile/.env.example`);
}
const rootEnv = await read(".env.example");
for (const key of ["CLOUDFLARE_STREAM_WEBHOOK_SECRET", "CLOUDFLARE_R2_PUBLIC_BASE_URL", "CRON_SECRET"]) {
  assert(rootEnv.includes(`${key}=`), `Missing ${key} from .env.example`);
}

console.log("Foundation static validation passed.");