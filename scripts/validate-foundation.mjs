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

assert(
  JSON.stringify(migrations) === JSON.stringify([
    "001_init.sql",
    "002_growth_engine.sql",
    "003_entertainment_engine.sql",
    "004_template_library.sql",
    "005_feed_pagination.sql",
  ]),
  `Unexpected migration set: ${migrations.join(", ")}`,
);

const templatesSql = await read("supabase/migrations/004_template_library.sql");
const templateCount = templatesSql.split("\n").filter((line) => line.startsWith("('")).length;
assert(templateCount === 60, `Expected 60 launch templates, found ${templateCount}`);

const entertainmentSql = await read("supabase/migrations/003_entertainment_engine.sql");
assert(entertainmentSql.includes("create or replace function public.get_feed_v1"), "Missing baseline get_feed_v1 feed RPC");
assert(entertainmentSql.includes("alter table public.posts enable row level security"), "Posts RLS is not enabled");

const paginationSql = await read("supabase/migrations/005_feed_pagination.sql");
for (const cursorPart of ["cursor_score", "cursor_time", "cursor_post_id"]) {
  assert(paginationSql.includes(cursorPart), `Feed pagination is missing ${cursorPart}`);
}
assert(
  paginationSql.includes("order by r.score desc, r.published_at desc, r.post_id desc"),
  "Feed cursor does not match feed ordering",
);
assert(!paginationSql.includes("now() - p.published_at"), "Feed cursor score must not drift between page requests");

const mobilePackage = JSON.parse(await read("mobile/package.json"));
const mobileAppConfig = JSON.parse(await read("mobile/app.json")).expo;
assert(mobilePackage.version === mobileAppConfig.version, "Mobile package and Expo app versions must match");
assert(mobilePackage.dependencies?.expo?.startsWith("~57."), "Mobile must remain on Expo SDK 57 for this baseline");
assert(mobilePackage.engines?.node === ">=22.13.0", "Mobile Node baseline must remain >=22.13.0");
for (const dependency of ["@supabase/supabase-js", "@react-native-async-storage/async-storage", "react-native-url-polyfill"]) {
  assert(mobilePackage.dependencies?.[dependency], `Missing mobile dependency: ${dependency}`);
}

const supabaseClient = await read("mobile/src/lib/supabase.ts");
assert(supabaseClient.includes("persistSession: true"), "Mobile Supabase session persistence is disabled");
assert(supabaseClient.includes("storage: AsyncStorage"), "Mobile Supabase auth storage is not configured");

const rootLayout = await read("mobile/app/_layout.tsx");
assert(rootLayout.includes("<AuthProvider>"), "Mobile root is missing AuthProvider");

const mobileFeed = await read("mobile/src/api/feed.ts");
assert(mobileFeed.includes('rpc("get_feed_v1"'), "Mobile feed is not wired to get_feed_v1");
assert(mobileFeed.includes("fetchFeedPage"), "Mobile feed pagination API is missing");
assert(mobileFeed.includes("cursor_post_id"), "Mobile feed does not send the keyset cursor");

const mobileHome = await read("mobile/app/(tabs)/index.tsx");
assert(mobileHome.includes("onEndReached"), "Mobile Home infinite scroll is missing");

const mobileTemplates = await read("mobile/src/api/templates.ts");
assert(mobileTemplates.includes('.from("challenge_templates")'), "Mobile Explore is not wired to challenge_templates");

assert(mobileAppConfig?.scheme === "proofmode", "Missing proofmode app scheme");
assert(mobileAppConfig?.ios?.associatedDomains?.includes("applinks:proofmode.app"), "Missing iOS associated domain");
assert(mobileAppConfig?.android?.intentFilters?.some((filter) => filter.action === "VIEW"), "Missing Android app-link intent filter");

const supabaseConfig = await read("supabase/config.toml");
assert(supabaseConfig.includes('project_id = "proofmode"'), "Supabase local project config is missing");

for (const testFile of [
  "supabase/tests/database/001_schema_auth.test.sql",
  "supabase/tests/database/002_rls.test.sql",
  "supabase/tests/local/003_feed_pagination.test.sql",
]) {
  const sql = await read(testFile);
  const plan = Number(sql.match(/select\s+plan\((\d+)\)/i)?.[1]);
  const assertions = (sql.match(/select\s+(?:ok|is|throws_ok|throws_like|lives_ok)\s*\(/gi) ?? []).length;
  assert(Number.isInteger(plan) && plan === assertions, `pgTAP plan mismatch in ${testFile}: plan=${plan}, assertions=${assertions}`);
  assert(sql.includes("select * from finish()"), `Missing pgTAP finish in ${testFile}`);
  assert(sql.trimEnd().endsWith("rollback;"), `Database test must rollback: ${testFile}`);
}

const ci = await read(".github/workflows/ci.yml");
assert(ci.includes("supabase/setup-cli@v1"), "CI is missing Supabase CLI setup");
assert(ci.includes("supabase test db supabase/tests/database supabase/tests/local"), "CI is missing complete database tests");

const envExample = await read("mobile/.env.example");
for (const key of ["EXPO_PUBLIC_APP_ENV", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
  assert(envExample.includes(`${key}=`), `Missing ${key} from mobile/.env.example`);
}

console.log("Foundation static validation passed.");
