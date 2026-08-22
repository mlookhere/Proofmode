# ProofMode Infrastructure Provisioning Order

Do not create every paid service on day one. Provision in dependency order.

## 1. Domains / accounts
- proofmode.app (or final domain)
- Apple Developer
- Google Play Console
- Cloudflare
- Vercel
- Supabase
- Expo/EAS
- PostHog
- RevenueCat
- Stripe
- Resend
- Sentry

Turn on organization 2FA and recovery access immediately.

## 2. Environments
Create `local`, `staging`, `production` separation. Production should never share database/storage buckets with staging.

## 3. Core backend
Create Supabase staging, apply migrations 001 → 002 → 003, seed safe templates, enable intended auth providers and confirm RLS.

## 4. Media
Create separate R2 buckets for public/derived assets and protected originals as needed. Configure Cloudflare Images transformations. Create Stream account/app configuration for user video. Prefer direct client uploads with short-lived authorization.

## 5. Web
Connect Next.js project to Vercel. Configure domains, secrets, previews, production branch and usage alerts.

## 6. Mobile
Create Expo project IDs and EAS build profiles. Configure bundle/package identifiers, Universal/App Links, push credentials, Store Connect/Play connections.

## 7. Analytics / errors
PostHog separate staging/prod projects or filters. Sentry release tagging. Never send raw proof media/private captions to analytics.

## 8. Billing
Create store products + RevenueCat offerings/entitlements. Web billing remains policy-aware and should be verified per storefront/region before release.

## 9. Email / support
Configure sending domain, SPF/DKIM, transactional templates, support contact and abuse contact.

## 10. Budgets
Set alerts for Vercel, Supabase, Cloudflare, PostHog, Sentry, RevenueCat/Stripe. Cloudflare Stream minutes delivered are likely the first truly elastic consumer-infra cost.
