# Staging verification

Run this stage before adding more mobile behavior. It verifies the migrations, auth-triggered profile creation, RLS boundaries, challenge joins/watch state, and feed pagination against the same database contract the app uses.

## Local database gate

Requires Docker-compatible containers and Supabase CLI `2.115.0`.

```bash
supabase db start
supabase test db supabase/tests/database supabase/tests/local
```

CI runs the same database tests automatically.

## Staging gate

Use an isolated Supabase staging project. Do not run these commands against production.

```bash
supabase login
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --dry-run
supabase db push
supabase test db supabase/tests/database --linked
```

The linked pgTAP suite runs transactionally and rolls back its test data. Feed pagination uses a separate clean-local test because a shared staging feed can contain unrelated ranked posts; pagination is exercised against staging through the mobile smoke checks below.

After the linked tests pass, point the mobile staging environment at the staging project and verify:

1. Home loads `get_feed_v1` and can fetch another page without duplicates.
2. Explore loads all 60 `challenge_templates`.
3. A new email account creates a `profiles` row automatically.
4. The signed-in You tab loads the profile and `get_profile_snapshot`.
5. Signed-out Home and Explore remain readable.
6. Post, Crews, and You still require authentication.

Only after this gate passes should development move to Apple/Google sign-in and the plan-required email magic-link fallback/recovery flow.
