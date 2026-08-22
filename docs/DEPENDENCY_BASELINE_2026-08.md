# Dependency baseline — August 2026

ProofMode has two JavaScript applications with different compatibility constraints. They should not share a single dependency graph.

## Web (`proofmode-v3`)

Use current stable web packages:

- Next.js `16.2.11`
- React `19.2.8`
- React DOM `19.2.8`
- Supabase JS `2.112.3`
- Supabase SSR `0.12.4`
- TypeScript `7.0.2`

The root package intentionally pins exact versions for reproducible builds.

## Mobile (`proofmode-v3/mobile`)

Use Expo SDK 57's stable compatibility set rather than independently upgrading React Native/React/TypeScript:

- Expo `57.0.x`
- Expo Router `57.0.x`
- React Native `0.86.2`
- React / React DOM `19.2.3`
- TypeScript `6.0.3`
- Reanimated `4.5.1`
- Worklets `0.10.1`

React Native 0.87 is newer, but it is not the stable React Native target for Expo SDK 57. Do not move the production app to Expo canary just to chase an independently newer React Native minor.

## Upgrade rule

1. Web dependencies can move independently after `npm run typecheck` and `npm run build` pass.
2. Expo/native dependencies move as an SDK compatibility set using `npx expo install --fix` after the target SDK has a stable release.
3. Never resolve native peer conflicts with `--force` or `--legacy-peer-deps`.
4. Never run `npm audit fix --force` blindly on an Expo app. Review the dependency path first.
5. Commit generated lockfiles after a clean successful install in a networked development/CI environment.
