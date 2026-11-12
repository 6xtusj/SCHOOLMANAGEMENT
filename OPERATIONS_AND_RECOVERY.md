# Operations, persistence and recovery

## Critical: Render inactivity is not a database backup

Render Free services sleep after inactivity and have an ephemeral filesystem. A sleeping Flask service should not lose data stored in Neon/PostgreSQL, including uploaded file bytes. If records disappear after the service wakes, first verify whether the deployed app is accidentally using local SQLite.

1. Open `https://YOUR-RENDER-SERVICE/healthz`.
2. Confirm `database_engine` is `postgresql` and `database` is `ok`.
3. If it says `sqlite`, stop entering data. In Render → your service → Environment, set `DATABASE_URL` to the correct Neon PostgreSQL connection string (use the Neon pooled connection string with TLS), save and redeploy.
4. Confirm `APP_ENV=production`, `DB_POOL_MIN=1`, and a modest `DB_POOL_MAX` suitable for the host's worker/thread count.
5. Open `/api/admin/system-storage` while signed in as Admin or Principal to see the selected engine and record counts. It never returns the database URL or password.
6. Do not create a fresh Neon database/branch or restore over the only existing database until you have located and backed up the current data.

The application now refuses production startup when `DATABASE_URL` is missing or invalid, unless the operator deliberately enables `ALLOW_SQLITE_IN_PRODUCTION=true`. That override is only for a single host with a genuinely persistent mounted disk (for example the included Oracle Docker volume), never Render Free.

## Neon/PostgreSQL configuration

- Use separate development and production Neon databases.
- Set `DATABASE_URL` only in the server environment; never put it in Vite variables, source control or screenshots.
- Use the pooled Neon URL where available. Keep `DB_POOL_MAX` within the database/provider connection budget. Gunicorn currently runs one worker and four threads in the included Dockerfile; pool defaults are conservative.
- A Render restart/sleep must not switch the database URL. Verify `/healthz` after every deploy.

## Private upload storage in Neon

Set `UPLOAD_STORAGE=database`. The application stores file bytes and metadata in the Neon PostgreSQL `stored_files` table. No Cloudflare R2/S3 bucket, API token, storage credentials or Render disk is required. Existing authorization checks remain in the `/uploads/<filename>` route. Include the database in every backup because it now contains both school records and uploaded files.

## Backups

Database backup (PostgreSQL client tools required):

```bash
python backup_postgres.py ./backups
```

Restore only to a new empty test database first:

```bash
DATABASE_URL="postgresql://...test database..." python restore_postgres.py ./backups/school_postgres_YYYYMMDDTHHMMSSZ.dump
```

Store backups outside the application host and outside the primary bucket/account where possible. A backup on the same Render filesystem is not a backup. Keep database and upload backups from compatible times and periodically perform a full restore drill.

## Single-host SQLite option

The included Oracle Docker Compose setup mounts `/var/data` as a persistent Docker volume. SQLite is permitted only when the operator explicitly sets `ALLOW_SQLITE_IN_PRODUCTION=true` and protects that volume with off-host backups. A Docker volume is persistent storage, not high availability and not a substitute for backups.

## Incident response if records appear missing

- Do not create new records or change database environment variables repeatedly.
- Capture the current `/healthz` response and Render deploy logs (redact secrets).
- Check whether `database_engine` says `sqlite` or `postgresql`.
- In Neon, inspect the project, branch, database and restore/backup history. Verify the exact database name/branch in the connection string without sharing credentials.
- Search the local development `school.db` and previous backup archives; never overwrite them.
- Restore a candidate backup into a separate database, compare record counts and sample academic/finance records, and only then plan a controlled cutover.
