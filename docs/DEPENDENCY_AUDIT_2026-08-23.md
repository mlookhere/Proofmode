# ProofMode Dependency Audit — 2026-08-23

## Scope

This audit covers the root Next.js application and the Expo mobile application after the v0.9 Media/Create integration and migration 009 feed correction.

Evidence was generated on GitHub Actions with Node `v22.13.0` and npm `10.9.2`.

- Evidence workflow run: `32684808691`
- Evidence artifact digest: `sha256:c4364e5b13e1a9560302de9bb3fa4ac9cf709a41621de5d2c99d17f398fe6337`
- Root package: `proofmode@3.0.1`
- Mobile package: `proofmode-mobile@0.9.0`

The temporary audit workflow used to generate the lockfile and evidence was removed before review.

## Root web application

### Before remediation

With `next@16.2.11`, both the full and `--omit=dev` npm audits reported **3 high-severity vulnerable packages**:

| Package | Relationship | Finding | Fix reported by npm |
| --- | --- | --- | --- |
| `next@16.2.11` | direct | affected through vulnerable `postcss` and `sharp` dependencies | `next@16.3.2` |
| `postcss <=8.5.22` | transitive through Next.js | XSS and source-map path/file disclosure advisories | through `next@16.3.2` |
| `sharp <0.35.0` | transitive through Next.js | inherited libvips vulnerabilities | through `next@16.3.2` |

PostCSS advisories reported by npm:

- `GHSA-qx2v-qp2m-jg93` — XSS through unescaped `</style>` in CSS stringify output.
- `GHSA-6g55-p6wh-862q` — arbitrary file read/information disclosure through attacker-controlled `sourceMappingURL`.
- `GHSA-fxqj-rqcc-2cmp` — incomplete fix of the source-map file-read issue.
- `GHSA-r28c-9q8g-f849` — path traversal in previous source-map auto-loading.

Sharp advisory reported by npm:

- `GHSA-f88m-g3jw-g9cj` — inherited libvips vulnerabilities including CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, and CVE-2026-35591.

### Remediation

`next` was moved from `16.2.11` to the npm-recommended non-major fix `16.3.2`. No React or TypeScript version change was required.

The resulting lockfile resolves:

- `next@16.3.2`
- `postcss@8.5.23`
- `sharp@0.35.3`
- `typescript@6.0.3`

After the change, both root audits report:

- Critical: `0`
- High: `0`
- Moderate: `0`
- Low: `0`
- Total: `0`

ProofMode Web typecheck and the Next production build both pass with `next@16.3.2` and the existing `typescript@6.0.3` compatibility pin.

## Mobile application

Both the full and `--omit=dev` mobile audits report **10 moderate-severity package findings**, with no high or critical findings.

Affected dependency set:

- `expo`
- `@expo/cli`
- `@expo/config`
- `@expo/config-plugins`
- `@expo/inline-modules`
- `@expo/local-build-cache-provider`
- `@expo/metro-config`
- `@expo/prebuild-config`
- `xcode`
- `uuid`

The concrete `uuid` chain from the installed SDK-57 tree is:

```text
expo@57.0.15
└─ @expo/config-plugins@57.0.8
   └─ xcode@3.0.1
      └─ uuid@7.0.3
```

The `uuid` advisory is `GHSA-w5hq-g745-h8pq`, which affects `uuid <11.1.1` for missing buffer bounds checks in v3/v5/v6 when a buffer is supplied.

ProofMode does not directly depend on `uuid` or `xcode`; they are part of Expo's config/build tooling dependency chain. npm's proposed aggregate fix is `expo@46.0.21`, marked as a semver-major change from the current dependency. That would be a large unsupported rollback from the project baseline of Expo SDK 57 and is not an acceptable security remediation.

No `overrides` entry is being used to force `uuid@11` under `xcode@3.0.1`, because that would place a major version outside the dependency's resolved contract without upstream compatibility evidence. No `npm audit fix --force` was used.

The mobile findings therefore remain an **upstream Expo toolchain dependency constraint**, with the current controls:

- no high or critical npm findings;
- exact mobile lockfile retained;
- Expo SDK 57 retained;
- no unsupported transitive override;
- re-audit when Expo ships a compatible dependency update.

## Reproducibility controls

- Root `package-lock.json` is committed at lockfile version 3.
- Root Web CI uses `npm ci --ignore-scripts` and keys npm cache state from `package-lock.json`.
- Mobile CI continues to use its existing committed lockfile and `npm ci`.
- Foundation validation checks root manifest/lock parity, the audited Next/PostCSS/sharp security floors, the TypeScript 6 compatibility pin, locked Web CI, and absence of the temporary audit workflow.
- The final review diff remains below the configured 80-file / 4,000-changed-line large-change thresholds, so `risk:large-change` is not applicable.

## Current result

Root web dependency risk identified by the v0.9 audit is remediated and locked. Mobile has no high/critical npm findings; its remaining 10 moderate findings are confined to the current Expo dependency graph and have no safe SDK-57-compatible remediation identified by npm. They remain documented for upstream re-audit rather than being hidden or force-fixed.
