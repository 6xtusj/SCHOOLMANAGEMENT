# Operations, portability and recovery

## Production configuration

- Set `APP_ENV=production`, a stable random `SECRET_KEY` (32+ characters), and a PostgreSQL `DATABASE_URL`. Production now refuses to start with SQLite or a missing PostgreSQL URL.
- Use `psycopg` plus `psycopg-pool`; tune `DB_POOL_MIN`/`DB_POOL_MAX` to the host's worker/thread count and the database provider's connection limit. The Render blueprint uses a conservative pool maximum of 4. Do not increase it without checking Neon limits.
- Set `UPLOAD_STORAGE=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT_URL`, `S3_REGION=auto`, and `S3_PREFIX=school-uploads`. For Cloudflare R2, endpoint format is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; use an R2 S3 API token with only the required bucket permissions. Keep the bucket private.
- The storage adapter uses the S3 API, not R2-specific SDK calls. Backblaze B2 and AWS S3 remain compatible by changing endpoint/region and credentials. This avoids provider lock-in.
- Keep the same `SECRET_KEY` across restarts; it protects sessions and encrypted staff bank details. Store secrets only in the hosting secret manager or local ignored `.env`. Never place credentials in `VITE_*` variables or source control.

## Database changes and data safety

The existing application has an additive `schema_migrations` ledger and schema-upgrade routine. It is retained to preserve existing installations. The routine still runs additive schema checks at startup; this release does not introduce Alembic or destructive table rebuilds. Before upgrading, take a provider-native PostgreSQL snapshot/export and verify a restore to a separate database. Do not point a restore command at the live database.

Production never silently falls back to a local SQLite file. A deliberate single-host deployment (such as the included Oracle VM profile) may explicitly set `ALLOW_SQLITE_IN_PRODUCTION=true` only when its database is on a persistent disk; that mode is not suitable for horizontally scaled hosting. Similarly, `ALLOW_LOCAL_UPLOADS_IN_PRODUCTION=true` is only for a persistent host volume. For portable/multi-instance deployment, use PostgreSQL + private S3-compatible storage. Existing SQLite records are not automatically copied to PostgreSQL: use a separately planned, verified migration if you have records that must be moved.

## Backups

- SQLite development: `python backup_school.py` captures a consistent SQLite snapshot and local `uploads/` files.
- PostgreSQL: `python backup_postgres.py` uses `pg_dump` custom format. It does not modify the database. Install PostgreSQL client tools, set `DATABASE_URL`, and store the resulting dump off-host.
- Object storage: enable bucket versioning/replication or scheduled export using your provider's controls. Database backups do not include uploaded objects.
- Restore to an isolated database and isolated bucket/prefix first. Verify student, parent, staff, fee, payment, result, attendance, report archive and document records before planning production recovery. Preserve the original backup and live data.

## Health, logs and capacity

`/healthz` now checks a real database query and returns HTTP 503 when the database is unavailable. Application logs should be collected by the host and retained outside ephemeral containers. Configure external uptime/error monitoring.

The general `/api/entities/<name>` endpoint retains its existing array response for compatibility and still performs permission filtering in application code. It retains its existing default response cap of 1,000 (maximum 5,000), but it is not a complete server-side pagination implementation for every entity. Portal Accounts already has dedicated server-side search/filter/pagination. Large operational datasets require follow-up endpoint-specific pagination and query plans before claiming a 5,000+ student production capacity.

## Background work and concurrency

The application currently handles requests synchronously. This release uses a bounded database connection pool but does not add Redis/Celery or an unconfigured queue service. Long-running email, bulk import/export and report-generation work should be moved to a managed worker when workload and host are selected; do not add a queue dependency without provisioning its durable broker and worker.

## Deployment portability

The Docker image remains the primary portable deployment unit. Any Docker-capable Python host can run it with PostgreSQL and an S3-compatible bucket. Set the host's port, health check `/healthz`, database URL, secrets and bucket credentials. The Render blueprint is an example, not a required runtime dependency.
