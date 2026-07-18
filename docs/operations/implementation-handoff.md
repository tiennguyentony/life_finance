# Account save and performance handoff

This file is the durable continuation context for the current implementation branch. It contains no credentials.

## Branch and commits

- Branch: `feature/auth-save-performance`
- Base: `f808c44`
- `e291629` — Supabase email OTP authentication foundation
- `542884f` — account-owned persistent saves and legacy-save claim
- `455a27d` — reduced command traffic, dormant outbox writes, and missing FK index
- `72d4458` — bounded demo memory and lighter landing/board rendering
- `fdddd69` — local auth/save verification and deployment handoff
- `ea9945b` — browser-safe Supabase public environment configuration
- `e63e83a` — new-game onboarding hydration and navigation fix
- `c29747c` — restore saved runs without initializing the tax runtime
- `fc40e55` — board commands consistently target the current run month
- `0f277bf` — pin Three.js r182 to remove the deprecated Clock warning
- `59b008b` — account save listing and atomic restore backend
- `115beef` — saved-game navigation and restore UI
- `6b389b7` — keep current-game management on `/saves`
- `5cacde9` — allow confirmed custom living costs to evolve after onboarding

Nothing in this sequence has been pushed to `main`. Continue testing locally and obtain player acceptance before merge/push.

## Implemented invariants

1. Production gameplay pages require a verified Supabase session.
2. A Supabase user has at most one `save_status = 'active'` run.
3. Starting another owned run archives the previous run in the same transaction.
4. A valid pre-auth capability cookie can be claimed once; it cannot steal a run owned by another user.
5. Persistent commands authorize against the server-derived user ID, never a browser-supplied user ID.
6. Instant Demo remains development-only, in memory, and capability-authenticated.
7. Normal browser commands avoid the old preliminary state read and do not return the unused monthly record.
8. The three onboarding personas are starting profiles, not independent save slots.
9. The board exposes New Game. Merely entering setup preserves the current save; successfully creating the replacement archives the prior active save.
10. `/generating` waits for persisted onboarding hydration before deciding whether a profile is missing, and profile state is persisted before navigation.
11. Restoring a run uses a read-only gateway and does not initialize the tax client; tax configuration is required only by command processing.
12. Board plan commands always target `run.currentMonth`; the recurring strategy's effective month is historical state and must not be reused after time advances.
13. Three.js is pinned to r182 until React Three Fiber replaces its deprecated `THREE.Clock` dependency; do not widen the version range without checking the browser console and board render.
14. `/start` is dedicated to new-game persona selection; the header links to `/saves`, which lists up to 50 account-owned games. Restoring an archived game atomically archives the previous active game without deleting either.
15. Account commands are accepted only for the currently active save; archived saves are read-only until restored.

## Local verification performed

- Landing, demo creation, board render, and one monthly command returned `200/201/200/200`.
- Monthly response measured about 1.63 KB versus the audited old average of about 5.25 KB.
- Production build passed with syntactically valid public Supabase build values.
- Local Supabase migrations `0000` through `0008` applied successfully.
- Local email OTP produced the custom six-digit email and verified to a Supabase user/session.
- PostgreSQL repository tests include account ownership, archive, resume, and cross-account claim rejection.
- The latest locally generated account run was loaded and projected successfully through the read-only gateway.
- A persisted start-to-retirement profile processed 480 months plus 11 event choices in 53.1 seconds. Command latency was 111 ms at p50, 179 ms at p95, and 226 ms maximum on the local machine.
- At month 480 the authoritative state was about 783 KB, while the browser projection remained about 2.1 KB. The long-run regression gate caps these at 1 MB and 8 KiB respectively.
- Heap samples across the persistent run fluctuated with garbage collection instead of increasing monotonically. RSS ended near 345 MB in the Vitest process.
- The optimized production Next.js server idled near 157 MB RSS. The development compiler reached roughly 1.5 GB after extended use, so dev RSS must not be treated as deployment memory.
- A cold development command spent about 950 ms compiling and 25 ms in application code; the next command completed in 16 ms total and 11 ms in application code.

## Performance interpretation

- Public reads and command responses use `RunView`; ledger history, command IDs, and other internal replay data are not sent to the browser.
- PostgreSQL statement execution was a small part of the 480-month profile. The largest individual statements averaged about 1–2 ms; deterministic reduction, validation, hashing, and serialization dominate late-game command time.
- The authoritative state intentionally retains an append-only ledger and accepted command IDs for audit and deterministic replay. It grows linearly with game age, but remains below the current 1 MB long-run budget. Do not remove this evidence merely to reduce JSON size without first replacing replay and integrity guarantees.
- PolicyEngine is cached by annual tax context. The first uncached calculation can be much slower than later monthly commands; do not call the tax service again for an unchanged annual context.
- Custom expense evidence is an immutable record of the confirmed opening budget. The live annual living cost is mutable because inflation and player choices change it; conflating those fields previously broke the first month of a custom-expense run.

## Before deployment

1. Finish the full verification gate and database integration suite.
2. Apply migrations `0007` and `0008` to a reviewed non-production target first.
3. Configure Vercel runtime variables; a Vercel token by itself is insufficient.
4. Configure both Supabase confirmation and magic-link email templates to display `{{ .Token }}`.
5. Test two browsers with the same email, new-save archival, and a different-account claim rejection.
6. Only after acceptance, merge/push the individual commits to `main` and deploy.
