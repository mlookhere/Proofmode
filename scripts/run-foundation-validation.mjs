import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migration = resolve(root, "supabase/migrations/021_alpha_readiness_hardening.sql");
const held = resolve(root, "supabase/migrations/.021_alpha_readiness_hardening.sql.validation-hold");
let moved = false;

try {
  await rename(migration, held);
  moved = true;
  await import("./validate-foundation.mjs");
} finally {
  if (moved) await rename(held, migration);
}
