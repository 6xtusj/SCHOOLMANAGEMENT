# V9.0 — database reliability and portable storage foundation

- Added a bounded `psycopg-pool` connection pool with configurable minimum/maximum size, checkout timeout, idle timeout and reconnect window. Connections are returned to the pool after transaction completion.
- Production now requires a PostgreSQL URL by default and fails clearly rather than silently using an ephemeral SQLite file. An explicit opt-in remains for the documented single-host persistent-volume deployment.
- Production uploads require private S3-compatible object storage by default. The existing storage adapter supports Cloudflare R2 through its S3 endpoint without R2-specific application code; B2 and AWS S3 remain supported. A documented explicit local-volume override preserves the single-host Oracle profile.
- `/healthz` performs a database query and reports HTTP 503 on database failure.
- Added a PostgreSQL `pg_dump` backup helper and operations/recovery documentation. Existing SQLite backup remains available.
- Added pool return, production database fail-fast, and R2-compatible storage regression tests.
- Preserved the existing React frontend, page layouts, routes, role enforcement, school workflows, and supplied SQLite database.

## Not represented as completed

This release is an infrastructure foundation, not a full certification of every one of the 15 requested workstreams. General entity endpoints still need complete server-side pagination and endpoint-specific query optimisation; schema upgrades still use the existing additive startup migration routine rather than a fully separated Alembic deployment; background queues, object-store backup automation/restore, antivirus scanning, and comprehensive concurrent-user/browser end-to-end testing are not included. See `V9_0_IMPLEMENTATION_REPORT.md` and `OPERATIONS_AND_RECOVERY.md`.
