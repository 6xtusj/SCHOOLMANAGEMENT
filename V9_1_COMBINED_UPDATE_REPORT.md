# V9.1 — Combined reliability, persistence and scale update

## Why the hosted records appeared to disappear

Render Free web services sleep after inactivity and use an ephemeral local filesystem. Sleeping by itself should not delete records in a managed PostgreSQL database. If the deployed application uses its local SQLite `school.db` instead of the configured Neon/PostgreSQL database, records written to the instance filesystem are not durable across instance replacement/restart. Earlier V8 code allowed an empty/missing `DATABASE_URL` to fall back to SQLite, which is an unsafe production default. V9 introduced a production fail-fast check; V9.1 adds visible, credential-free diagnostics to prove which database the running instance is actually using.

After deploying this version, open `/healthz`. A Render deployment intended for real data must return `database_engine: "postgresql"`. If it reports `sqlite`, stop entering data and correct the Render `DATABASE_URL` setting before continuing. `/api/admin/system-storage` (Admin/Principal login required) reports the database engine and record counts without exposing connection strings or credentials.

**This package cannot recover records that were written only to a lost ephemeral SQLite filesystem.** Check the previous Render deploy logs, any local `school.db`, Neon project/branch, and Neon backups/restore points before assuming the records are permanently lost. Do not point the app at a new empty database or run a destructive restore over the only copy.

## Combined changes in this release

1. PostgreSQL is mandatory in production unless a deliberate persistent single-host SQLite override is explicitly enabled.
2. Fixed a connection-pool lifecycle defect: context-managed PostgreSQL connections are committed/rolled back and returned to the pool instead of closing the raw connection and leaking a pool checkout.
3. Bounded pool settings remain configurable for host worker/thread capacity.
4. `/healthz` identifies the database engine and storage mode; Admin/Principal-only system diagnostics report entity record counts without exposing secrets.
5. Admin/Principal entity list requests support SQL-side JSON-field filters, sort, page/per-page or offset/limit and return pagination metadata in response headers. Existing array response shape is preserved. Existing row-level permission filtering remains unchanged for other roles.
6. Added indexes for common attendance, results, fee-payment, timetable and updated-record lookups.
7. Existing schema changes remain additive/idempotent and the current schema_migrations ledger is retained. This is not yet a full Alembic-style migration/rollback framework; see limitations.
8. Existing React/Vite pages, layouts, routes, permissions and workflows are retained. The pagination API is backward-compatible; existing pages are not all switched to paginated controls in this release.
9. Existing private S3-compatible storage adapter remains provider-agnostic; Cloudflare R2 is the initial configuration, not a hard-coded dependency.
10. Added S3-compatible object-store backup and checksum-verified restore utilities. Restore skips existing keys unless explicit overwrite is enabled.
11. Added PostgreSQL restore utility that deliberately avoids destructive `--clean` behaviour and requires interactive confirmation.
12. Existing audit, login throttling, session security and role checks are retained; new diagnostics are restricted to Admin/Principal.
13. Added operational guidance for managed PostgreSQL, R2, off-host backups and safe recovery.
14. Health checks continue to validate a real database query; database engine is now visible for deployment diagnosis.
15. Ran combined syntax checks and focused database/storage tests; results are recorded below.

## Verification performed in this environment

- Python compilation: PASS for `app.py`, `database.py`, `storage.py`, `backup_postgres.py`, `restore_postgres.py`, `backup_object_storage.py`, and `restore_object_storage.py`.
- Database translation/pool tests: 11 PASS.
- Storage tests, including S3-compatible/R2 adapter: 4 PASS.
- ZIP archive integrity: to be checked on final archive.
- Live Neon connection and pool behaviour: NOT TESTED (no school database credentials available).
- Live Cloudflare R2 connection/restore: NOT TESTED (no bucket credentials available).
- Flask API runtime and browser workflows: NOT TESTED in this environment (Flask/Werkzeug dependencies unavailable here).
- Full frontend build/lint: NOT TESTED in this environment (no verified installed node_modules/build runtime).
- Real concurrency/load benchmark and production restore drill: NOT TESTED.

## Remaining production work — not falsely marked complete

- Convert every large-data page to use the pagination endpoint and update its controls/total counts; existing page calls remain backward-compatible but may still request large lists.
- Complete a formal, numbered migration runner with tested rollback/forward migration against copies of both SQLite and PostgreSQL databases.
- Decide and deploy a background worker/queue for long-running email/bulk operations; no Redis/queue service is silently added to free hosting.
- Complete full browser end-to-end tests across all roles and school workflows.
- Execute a Neon backup restore to a separate database and an R2 object restore to a separate bucket, then reconcile sample student, finance, academic and document records.
- Conduct load tests with realistic records and concurrent users on the chosen paid/production capacity.

This release improves persistence diagnosis and reliability but is not a certification of production readiness. No live credentials or real hosting environment were available for end-to-end verification.
