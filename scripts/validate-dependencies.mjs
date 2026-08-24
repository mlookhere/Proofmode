import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function atLeast(actual, minimum) {
  const a = actual.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

const packageJson = JSON.parse(await read("package.json"));
const lock = JSON.parse(await read("package-lock.json"));
const lockRoot = lock.packages?.[""];
assert(lock.lockfileVersion === 3, "Root npm lockfile must remain lockfileVersion 3");
assert(lock.version === packageJson.version && lockRoot?.version === packageJson.version, "Root package/lock versions are not synchronized");

for (const group of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(packageJson[group] ?? {})) {
    assert(lockRoot?.[group]?.[name] === version, `Root lockfile does not match ${group}.${name}`);
  }
}

assert(packageJson.dependencies?.next === "16.3.2", "Next.js security patch must remain pinned at 16.3.2 until intentionally reviewed");
assert(packageJson.devDependencies?.typescript === "6.0.3", "TypeScript 6 compatibility pin changed without review");
assert(lock.packages?.["node_modules/next"]?.version === packageJson.dependencies.next, "Locked Next.js version does not match package.json");
assert(atLeast(lock.packages?.["node_modules/postcss"]?.version ?? "0.0.0", "8.5.23"), "Locked PostCSS regressed below the audited security floor");
assert(atLeast(lock.packages?.["node_modules/sharp"]?.version ?? "0.0.0", "0.35.0"), "Locked sharp regressed below the audited security floor");

const ci = await read(".github/workflows/ci.yml");
assert(ci.includes("cache-dependency-path: package-lock.json"), "Web CI is not keyed to the root lockfile");
assert(ci.includes("npm ci --ignore-scripts"), "Web CI must use the locked root install");
assert(!ci.includes("npm install --ignore-scripts"), "Web CI still uses a floating npm install");

try {
  await access(resolve(root, ".github/workflows/dependency-audit-temp.yml"));
  throw new Error("Temporary dependency audit workflow must be removed before review");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Dependency reproducibility validation passed.");
