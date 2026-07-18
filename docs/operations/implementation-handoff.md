# Account save and performance handoff

This file is the durable continuation context for the current implementation branch. It contains no credentials.

## Branch and commits

- Branch: `feature/auth-save-performance`
- Base: `f808c44`
- `e291629` — Supabase email OTP authentication foundation
- `542884f` — account-owned persistent saves and legacy-save claim
- `455a27d` — reduced command traffic, dormant outbox writes, and missing FK index
- `72d4458` — bounded demo memory and lighter landing/board rendering

Nothing in this sequence has been pushed to `main`. Continue testing locally and obtain player acceptance before merge/push.

## Implemented invariants

1. Production gameplay pages require a verified Supabase session.
2. A Supabase user has at most one `save_status = 'active'` run.
3. Starting another owned run archives the previous run in the same transaction.
4. A valid pre-auth capability cookie can be claimed once; it cannot steal a run owned by another user.
5. Persistent commands authorize against the server-derived user ID, never a browser-supplied user ID.
6. Instant Demo remains development-only, in memory, and capability-authenticated.
7. Normal browser commands avoid the old preliminary state read and do not return the unused monthly record.

## Local verification performed

- Landing, demo creation, board render, and one monthly command returned `200/201/200/200`.
- Monthly response measured about 1.63 KB versus the audited old average of about 5.25 KB.
- Production build passed with syntactically valid public Supabase build values.
- Local Supabase migrations `0000` through `0008` applied successfully.
- Local email OTP produced the custom six-digit email and verified to a Supabase user/session.
- PostgreSQL repository tests include account ownership, archive, resume, and cross-account claim rejection.

## Before deployment

1. Finish the full verification gate and database integration suite.
2. Apply migrations `0007` and `0008` to a reviewed non-production target first.
3. Configure Vercel runtime variables; a Vercel token by itself is insufficient.
4. Configure both Supabase confirmation and magic-link email templates to display `{{ .Token }}`.
5. Test two browsers with the same email, new-save archival, and a different-account claim rejection.
6. Only after acceptance, merge/push the individual commits to `main` and deploy.
