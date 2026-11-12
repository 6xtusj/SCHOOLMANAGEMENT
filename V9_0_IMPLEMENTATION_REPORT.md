# V9.0 coordinated update — verification report

## Source and preservation

- Source archive: `schoolmanagement.zip` uploaded 12 November 2026 (44,296,965 bytes).
- Work was performed on an extracted working copy. The original uploaded ZIP was not modified.
- Existing frontend source/layouts and existing application workflows were retained.
- The bundled `school.db` is carried forward unchanged; no database reset or seed operation was run. `.env` and secret values are excluded from the release ZIP.

## Implemented in this release

1. **PostgreSQL production guard:** production requires PostgreSQL unless the operator explicitly opts into the single-host persistent SQLite profile. No silent SQLite fallback.
2. **Connection pooling:** added `psycopg-pool`, configurable bounds/timeouts and safe return of checked-out connections after commit/rollback.
3. **Storage portability:** retained the generic S3-compatible adapter; R2 works through its endpoint/credentials, with B2/AWS compatibility retained. Production defaults to private object storage; explicit local persistent-volume override preserves Oracle single-host mode.
4. **Health check:** `/healthz` now executes `SELECT 1` and returns 503 if the configured database is unavailable.
5. **Backup tooling:** added a `pg_dump`-based PostgreSQL backup helper, retaining the existing SQLite backup tool.
6. **Operations/deployment docs:** documented R2 setup, pool sizing, portable Docker hosting, backup separation, isolated restore practice, monitoring, and known scaling limits.
7. **Regression tests:** added production fail-fast, pool release and R2-compatible storage tests.

## Verification performed

- Python syntax compilation for `app.py`, `database.py`, `storage.py`, both backup scripts and modified tests: PASS.
- `tests/test_database.py`: 9 tests PASS.
- `tests/test_storage.py`: 4 tests PASS.
- Combined test discovery: NOT fully passed because this execution environment does not have Flask installed; `tests/test_workflows.py` could not import `flask.testing` (`ModuleNotFoundError`). This is an environment dependency limitation, not a passed test.
- PostgreSQL live connection/pool/reconnect test: NOT run; no live Neon credentials/database connection supplied.
- R2 live bucket test: NOT run; no R2 account/bucket credentials supplied. The R2 test uses an in-memory S3-compatible fake client.
- Frontend npm build/lint: NOT run; `node_modules` is not present and dependency installation was not attempted. Existing built `dist/` is preserved.
- Load test at 5,000+ students / 50 concurrent users: NOT run.
- Backup restore test: NOT run. `backup_postgres.py` requires `pg_dump` and a configured database.

## Remaining work before real-school production use

The user-approved 15-area scope is not fully closed by this package. In particular:

- General entity endpoints still load collections before application-level permission filtering. They retain their existing response cap (1,000 by default, 5,000 maximum), but this is not true pagination and may hide later rows in large datasets. Portal Accounts already has its own server-side pagination.
- The existing additive migration routine still runs at startup. A fully separated migration release/rollback process (for example Alembic) has not been introduced.
- Background queue/worker processing, complete page-specific frontend fetch/cache optimisation, database query-plan review, and full performance indexing review remain outstanding.
- Automated PostgreSQL + object-storage backup scheduling, object versioning/replication policy and a tested disaster-recovery restore remain operator tasks.
- Malware scanning, two-factor administrator authentication, comprehensive audit/retention review and multi-user conflict handling remain outstanding.
- Complete role-by-role browser end-to-end testing and load testing are still required.

Do not treat this ZIP as production-certified or use it with real student/banking data until the remaining items are addressed and the live hosting configuration, backups, security and school workflows are tested.
