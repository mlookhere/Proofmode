# Staging verification

Stage 1 is now repeatable locally and verified against the isolated Proofmode staging project through migration `006_staging_hardening`.

## Local database gate

Requires Docker-compatible containers and Supabase CLI `2.115.0`.

```bash
supabase start
supabase db lint --level error --fail-on error
supabase test db supabase/tests/database supabase/tests/local
```

CI runs the same local database gate automatically.

## Live staging gate

For a fresh isolated staging project:

```bash
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --dry-run
supabase db push
supabase test db supabase/tests/database --linked
```

The database tests run transactionally and roll back test data. Feed pagination keeps its deterministic fixture in the clean-local suite because a shared staging feed can contain unrelated ranked posts.

## Verified on 2026-08-22

The connected Proofmode staging project has migrations `001` through `006` applied. Live checks confirmed 60 canonical templates, RLS on the expected tables, the proof-media bucket, the keyset feed RPC, private RLS helpers, authenticated-only challenge joining, and service-role-only billing synchronization.

The remaining Supabase security-advisor warnings are expected for intentionally exposed read/join `SECURITY DEFINER` RPCs. The server-only `billing_events`, `moderation_actions`, and `job_outbox` tables have RLS with no client policies by design and client table grants are revoked.

The next plan stage is authentication, beginning with the email magic-link fallback/deep-link path before external Apple/Google provider credentials are wired.
