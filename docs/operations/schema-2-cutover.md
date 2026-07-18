# Schema-2 cutover

The current application reads and writes schema-2 runs only. Versioned public migration routes were removed so migration authority cannot be exposed to the browser.

## Before deployment

1. Back up the database.
2. Apply every Drizzle migration.
3. Count current run versions:

```sql
select state_schema_version, count(*)
from game_runs
group by state_schema_version
order by state_schema_version;
```

4. Deploy only when all active runs report `state_schema_version = 2`.

## If schema-1 runs remain

Do not change the version column manually. A valid migration must decode the old state, produce the schema-2 state and checksum, preserve revision and ledger history, and write migration evidence atomically. The repository retains this deterministic migration logic, but it is intentionally not a public endpoint.

Run an authenticated one-time operator job against a backup-verified database, or explicitly archive disposable pre-release runs. Re-run the version query and repository integration tests before deploying the unversioned API.

## Ongoing rule

New product features may version persisted engine records when replay requires it. They must not create parallel browser APIs. The public contract remains `/api/*` plus `RunView` and versionless command intent.
