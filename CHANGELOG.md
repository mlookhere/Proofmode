# Changelog

All notable ProofMode development checkpoints are recorded here.

## [0.8.0] - 2026-08-23

### Added
- Live public Drop discovery in mobile Explore.
- Public Drop detail route with persisted Join and Watch/Unwatch state.
- Auth return-route support so a signed-out Join or Watch resumes after magic-link sign-in.
- pgTAP regression coverage for persisted watch reads and unwatch.

### Changed
- Mobile version advanced to `0.8.0`.
- Explore now uses live challenge instances for participation instead of treating templates as joinable Drops.

## [0.7.0] - 2026-08-22

### Added
- Passwordless email magic-link sign-in using the existing ProofMode app scheme.
- Cold-start and foreground Supabase auth deep-link session completion.
- Local Supabase Auth redirect configuration.

### Changed
- Mobile version advanced to `0.7.0`.
- Auth UI is now one email field and one sign-in-link action.

### Removed
- Temporary email/password sign-in and sign-up flow.

## [0.6.0] - 2026-08-22

### Added
- Live Supabase staging verification through migration `006`.
- pgTAP security-hardening regression coverage.
- Database linting and hardened GitHub Actions CI settings.

### Changed
- Canonical challenge-template library is enforced at exactly 60 rows.
- RLS helper functions now live in a non-exposed `private` schema.
- Mobile version advanced to `0.6.0`.

### Removed
- Obsolete `join_public_challenge` RPC and web fallback.

### Security
- Billing synchronization is explicitly service-role-only.
- Public RPC grants and future function defaults are explicit instead of inherited.

## [0.5.0] - 2026-08-22

### Added
- Supabase local project configuration and transactional pgTAP database tests.
- Initial CI database verification gate.
