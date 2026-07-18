# Schema-2 cutover and production migrations

The active application writes schema-2 runs only. Persisted versions remain explicit for replay, while the public browser API remains unversioned.

## Deployment behavior

The frontend service uses `node scripts/vercel-build.mjs`. On a production Vercel build it:

1. requires `DATABASE_URL`;
2. runs `scripts/migrate-production.mjs`;
3. acquires PostgreSQL advisory lock `1279676997`;
4. applies the checked-in Drizzle migrations;
5. releases the lock and runs `pnpm build`.

Preview/non-production builds do not automatically migrate. The lock prevents two builds using this script from applying migrations concurrently, but it does not replace backup, compatibility, or rollback planning.

## Pre-deployment checklist

1. Back up the target database and confirm `DATABASE_URL` points to the intended environment.
2. Review every new file under `drizzle/` and run repository integration tests against a staging database.
3. Count persisted run versions:

   ```sql
   select state_schema_version, count(*)
   from game_runs
   group by state_schema_version
   order by state_schema_version;
   ```

4. Confirm the application version can read every version present during the rollout.
5. Deploy and verify application liveness **and** database/tax behavior; `/api/health` alone is only liveness.

## If schema-1 runs remain

Never edit `state_schema_version` by hand. A valid migration must decode the old state, create and validate schema 2, preserve revision/ledger causality, compute checksums, and write migration evidence atomically.

The repository retains deterministic schema-1 migration/replay support, but there is no public migration endpoint. Use an authenticated, one-time operator process against a backup-verified database, or explicitly archive disposable pre-release runs. Re-run the version query and repository integration tests afterward.

## Ongoing compatibility rule

New engine records may be versioned when deterministic replay requires it. Database changes must remain deploy-compatible with the currently serving application during rollout. Do not create parallel `/api/vN` browser surfaces to expose a persistence migration.
