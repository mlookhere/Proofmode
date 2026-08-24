import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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
]), `Unexpected migration set: ${migrations.join(", ")}`);

const templatesSql = await read("supabase/migrations/004_template_library.sql");
assert(templatesSql.split("\n").filter((line) => line.startsWith("('")).length === 60, "Expected 60 launch templates");

const hardeningSql = await read("supabase/migrations/006_staging_hardening.sql");
for (const staleTemplate of ["declutter-10", "desk-reset", "no-doordash", "stairs", "water-break"]) {
  assert(hardeningSql.includes(`'${staleTemplate}'`), `Missing stale template cleanup: ${staleTemplate}`);
}
assert(hardeningSql.includes("alter function public.is_challenge_member(uuid) set schema private"), "RLS helper is still exposed in public");
assert(hardeningSql.includes("drop function if exists public.join_public_challenge(text)"), "Legacy join RPC was not removed");
assert(hardeningSql.includes("to service_role"), "Billing RPC service-role grant is missing");

const clientAclSql = await read("supabase/migrations/007_client_acl_parity.sql");
assert(clientAclSql.includes("grant select on table public.challenges to anon, authenticated"), "Public challenge read grant is missing");
assert(clientAclSql.includes("grant select on table public.challenge_members to authenticated"), "Membership read grant is missing");
assert(clientAclSql.includes("grant select, insert, delete on table public.watched_challenges to authenticated"), "Watch persistence grants are missing");
assert(clientAclSql.includes("grant select on table public.profiles to authenticated"), "Authenticated profile read grant is missing");

const mediaLifecycle = await read("supabase/migrations/008_media_post_lifecycle.sql");
for (const required of [
  "posts_media_asset_unique_idx",
  "revoke insert, update, delete on table public.media_assets from anon, authenticated",
  "private.sync_media_post_lifecycle",
  "moderation:media:",
  "status = 'published'",
  "status = 'removed'",
  "status = 'draft'",
]) assert(mediaLifecycle.includes(required), `Media lifecycle migration is missing: ${required}`);

const entertainmentSql = await read("supabase/migrations/003_entertainment_engine.sql");
assert(entertainmentSql.includes("create or replace function public.get_feed_v1"), "Missing baseline get_feed_v1 feed RPC");
assert(entertainmentSql.includes("alter table public.posts enable row level security"), "Posts RLS is not enabled");
assert(entertainmentSql.includes("alter table public.media_assets enable row level security"), "Media RLS is not enabled");

const paginationSql = await read("supabase/migrations/005_feed_pagination.sql");
for (const cursorPart of ["cursor_score", "cursor_time", "cursor_post_id"]) assert(paginationSql.includes(cursorPart), `Feed pagination is missing ${cursorPart}`);
assert(paginationSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Feed cursor does not match ordering");
assert(!paginationSql.includes("now() - p.published_at"), "Feed cursor score must not drift between page requests");

const publicationGuardSql = await read("supabase/migrations/009_feed_publication_time_guard.sql");
assert(publicationGuardSql.includes("and p.published_at <= now()"), "Feed does not exclude future-dated published posts");
assert(publicationGuardSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Publication guard changed feed ordering");
for (const cursorPart of ["cursor_score", "cursor_time", "cursor_post_id"]) assert(publicationGuardSql.includes(cursorPart), `Publication guard is missing ${cursorPart}`);
assert(!publicationGuardSql.includes("now() - p.published_at"), "Publication guard must preserve deterministic feed score");

const socialSql = await read("supabase/migrations/010_social_actions.sql");
for (const required of [
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
]) assert(socialSql.includes(required), `Social migration is missing: ${required}`);
for (const reaction of ["proven", "respect", "lol", "run_it_back", "im_next"]) {
  assert(socialSql.includes(`'${reaction}'`), `Social migration is missing reaction: ${reaction}`);
}
for (const cursorPart of ["cursor_score", "cursor_time", "cursor_post_id"]) assert(socialSql.includes(cursorPart), `Social feed override is missing ${cursorPart}`);
assert(socialSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"), "Social feed override changed cursor ordering");
assert(!socialSql.includes("now() - p.published_at"), "Social feed override must preserve deterministic score");

const unblockSql = await read("supabase/migrations/011_social_unblock_visibility.sql");
assert(unblockSql.includes("public.get_my_blocks_v1"), "Blocked-user read RPC is missing");
for (const table of ["follows", "post_reactions", "comments", "blocks", "reports", "crew_messages"]) {
  assert(unblockSql.includes(`revoke insert, update, delete on table public.${table} from anon, authenticated`), `Social writes are not RPC-only for ${table}`);
}

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
assert(mobileFeed.includes('rpc("get_feed_v1"') && mobileFeed.includes("cursor_post_id"), "Mobile feed pagination contract is incomplete");
assert(mobileFeed.includes("media_public_url") && mobileFeed.includes("media_kind"), "Mobile feed ignores published media");
assert(mobileFeed.includes("viewer_follows") && mobileFeed.includes("viewer_reaction"), "Mobile feed ignores social viewer state");
const mobileHome = await read("mobile/app/(tabs)/index.tsx");
assert(mobileHome.includes("onEndReached"), "Mobile Home infinite scroll is missing");
assert(mobileHome.includes("onViewableItemsChanged") && mobileHome.includes("activePostId"), "Home does not pause off-screen video");
assert(mobileHome.includes("useFocusEffect") && mobileHome.includes("feedFocused && activePostId"), "Home video can continue playing while the tab is blurred");
assert(mobileHome.includes('media?.kind === "video"'), "Home viewability should only activate visible video posts");
assert(mobileHome.includes("hideBlockedUser"), "Home does not remove a newly blocked author");
const feedCard = await read("mobile/src/components/feed-card.tsx");
assert(feedCard.includes("VideoView") && feedCard.includes("useVideoPlayer"), "Feed card does not render video");
assert(feedCard.includes("<Image"), "Feed card does not render images");
assert(feedCard.includes("setFollow") && feedCard.includes("PostSocialModal"), "Feed card social actions are incomplete");

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
]) assert(mobileSocial.includes(`\"${rpc}\"`), `Mobile social API is missing ${rpc}`);
const postSocialModal = await read("mobile/src/components/post-social-modal.tsx");
assert(postSocialModal.includes("reactionKinds.map") && postSocialModal.includes("fetchPostComments"), "Post social modal is incomplete");
assert(postSocialModal.includes('openReport("comment"') && postSocialModal.includes('openReport("post"') && postSocialModal.includes('openReport("user"'), "Post/comment/user reporting is incomplete");
assert(postSocialModal.includes("setBlock") && postSocialModal.includes("BLOCK USER"), "Post social modal is missing block action");
const reportModal = await read("mobile/src/components/report-modal.tsx");
assert(reportModal.includes("reportReasons.map") && reportModal.includes("submitReport"), "Report reason picker is incomplete");

const mobileCrews = await read("mobile/app/(tabs)/crews.tsx");
const mobileCrewRoom = await read("mobile/app/crew/[id].tsx");
assert(mobileCrews.includes("fetchMyCrews") && mobileCrews.includes("/crew/"), "Crews tab is not backed by live rooms");
for (const required of ["fetchCrewRoom", "postCrewMessage", "deleteCrewMessage", "createCrewInvite", "leaderboard", "recent_activity", "messages"]) {
  assert(mobileCrewRoom.includes(required), `Crew room is missing: ${required}`);
}
const mobileYou = await read("mobile/app/(tabs)/you.tsx");
assert(mobileYou.includes("fetchMyBlocks") && mobileYou.includes("UNBLOCK") && mobileYou.includes("setBlock"), "Blocked-user management is incomplete");

const mobileChallenges = await read("mobile/src/api/challenges.ts");
const mobileExplore = await read("mobile/app/(tabs)/explore.tsx");
const mobileChallengeRoute = await read("mobile/app/challenge/[slug].tsx");
assert(mobileChallenges.includes('.from("challenges")'), "Mobile challenge discovery is not live");
assert(mobileChallenges.includes('rpc("join_challenge_v2"'), "Mobile Join is not wired to join_challenge_v2");
assert(mobileChallenges.includes("fetchJoinedPublicChallenges"), "Create cannot list joined public Drops");
assert(mobileExplore.includes("fetchPublicChallenges") && mobileExplore.includes("/challenge/"), "Explore is not linked to live Drop detail");
assert(mobileChallengeRoute.includes('runAction("join")') && mobileChallengeRoute.includes('runAction("watch")'), "Challenge actions are incomplete");
assert(mobileChallengeRoute.includes("ReportModal") && mobileChallengeRoute.includes("REPORT DROP"), "Drop reporting is incomplete");

const mobileCreate = await read("mobile/app/(tabs)/create.tsx");
for (const required of ["launchCameraAsync", "launchImageLibraryAsync", "MAX_VIDEO_SECONDS", "loadPendingUpload", "retryPendingUpload", "POST PROOF"]) {
  assert(mobileCreate.includes(required), `Mobile Create is missing: ${required}`);
}
assert(mobileCreate.includes("const userId = session?.user.id") && mobileCreate.includes("setChallengeId(joined[0]?.id || \"\")"), "Composer state is not reset safely across account changes");
const mobileMedia = await read("mobile/src/api/media.ts");
for (const required of ["createUploadTask", "BINARY_CONTENT", "MULTIPART", "proofmode.pending-media-upload.v2", "/api/media/upload-intent", "/api/media/finalize"]) {
  assert(mobileMedia.includes(required), `Mobile media client is missing: ${required}`);
}
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
for (const required of ["requireBearerUser", "SUPABASE_SERVICE_ROLE_KEY", "getSignedUrl", "timingSafeEqual", "MAX_VIDEO_BYTES", "MAX_VIDEO_SECONDS"]) {
  assert(mediaServer.includes(required), `Media backend is missing: ${required}`);
}
assert(mediaServer.includes("challenges!inner(visibility,format)") && mediaServer.includes('challenge?.format !== "drop"'), "Media authorization does not require a public Drop");
const uploadIntent = await read("app/api/media/upload-intent/route.ts");
assert(uploadIntent.includes("assertPublicChallengeMembership") && uploadIntent.includes("assertUploadRate"), "Upload intent authorization/rate limit is incomplete");
assert(uploadIntent.includes("RECOVERABLE_MEDIA_STATES") && uploadIntent.includes("Upload is no longer in a retryable state"), "Interrupted upload resume can regress terminal media state");
assert(uploadIntent.includes("playback_id: direct.uid") && uploadIntent.includes("playback_id: previousUid"), "Stream retry cleanup is incomplete");
const finalize = await read("app/api/media/finalize/route.ts");
assert(finalize.includes("assertPublicChallengeMembership") && finalize.includes("initialPost.challenge_id"), "Finalize does not reauthorize current Drop membership");
assert(finalize.includes('asset.processing_status === "deleted"'), "Finalize can revive discarded media");
const streamWebhook = await read("app/api/media/stream/webhook/route.ts");
assert(streamWebhook.includes("verifyStreamWebhook") && streamWebhook.includes('processing_status: "ready"'), "Stream webhook lifecycle is incomplete");
assert(streamWebhook.includes('asset.processing_status === "deleted"') && streamWebhook.includes('asset.processing_status === "ready"'), "Late Stream webhooks can regress terminal media state");
const cleanup = await read("app/api/media/cleanup/route.ts");
assert(cleanup.includes("CRON_SECRET") && cleanup.includes('processing_status: "deleted"'), "Media cleanup is not protected or stateful");
assert(cleanup.includes('["pending", "uploading", "processing", "failed"]'), "Cleanup does not recover stuck processing uploads");
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
  "supabase/tests/local/003_feed_pagination.test.sql",
]) {
  const sql = await read(testFile);
  const plan = Number(sql.match(/select\s+plan\((\d+)\)/i)?.[1]);
  const assertions = (sql.match(/select\s+(?:ok|is|throws_ok|throws_like|lives_ok)\s*\(/gi) ?? []).length;
  assert(Number.isInteger(plan) && plan === assertions, `pgTAP plan mismatch in ${testFile}: plan=${plan}, assertions=${assertions}`);
  assert(sql.includes("select * from finish()") && sql.trimEnd().endsWith("rollback;"), `Invalid transactional pgTAP file: ${testFile}`);
}

const ci = await read(".github/workflows/ci.yml");
assert(ci.includes("supabase/setup-cli@v2") && ci.includes("supabase start"), "CI local Supabase setup is incomplete");
assert(ci.includes("supabase db lint --level error --fail-on error"), "CI database lint is missing");
assert(ci.includes("supabase test db supabase/tests/database supabase/tests/local"), "CI database tests are incomplete");

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
