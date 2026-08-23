# ProofMode mobile MVP (Expo SDK 57)

This is the native consumer app for ProofMode 3.0 with the five core destinations: **Home / Explore / Post / Crews / You**.

The current stage connects the mobile shell to Supabase for persistent sessions and the first production read paths while keeping the public browsing experience available without an account.

## Requirements

- Node.js `22.13+`
- npm
- Expo SDK 57 compatible native toolchain

## Clean install

On Windows PowerShell:

```powershell
cd path\to\proofmode-v3\mobile
.\scripts\clean-install.ps1
npm run start:clear
```

Or manually:

```powershell
if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force }
npm cache verify
npm ci
npm run doctor
npm run typecheck
npm run start:clear
```

The lockfile is part of the source of truth. Do not delete it during a normal clean install.

## Environment

Copy `.env.example` to `.env.local` and provide the target Supabase project values:

```text
EXPO_PUBLIC_APP_ENV=local
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Without Supabase values, Home and Explore use the isolated preview data and auth displays a backend-not-configured state. With Supabase configured, the app uses live data and does not silently substitute demo records after backend failures.

## Implemented mobile foundation

- persistent Supabase session using the official JS client and AsyncStorage
- one root auth/session provider
- email magic-link sign-in with `proofmode://auth` deep-link session completion; Apple/Google provider integration is next
- public Home and Explore while signed out
- auth gating for Post, Crews, and You
- live `get_feed_v1` Home query with pull-to-refresh and keyset infinite scroll
- live `challenge_templates` Explore query
- live signed-in profile and `get_profile_snapshot` Passport metrics
- universal/app-link intent configuration

## Next production integrations

1. verify migrations and RLS against staging
2. Apple / Google auth plus the planned email magic-link fallback/recovery flow
3. challenge join/watch mutations
4. media capture, upload, processing, moderation, and publish recovery
5. reactions, comments, follows, Crew data, report/block
6. sharing/attribution, push, then RevenueCat

Use `npx expo install <package>` for Expo-managed native packages. Keep direct JavaScript-only dependencies pinned in `package.json` and the lockfile.

## Challenge actions

Explore loads live public Drops. Drop detail stays readable while signed out and persists Join plus Watch/Unwatch state after authentication.
