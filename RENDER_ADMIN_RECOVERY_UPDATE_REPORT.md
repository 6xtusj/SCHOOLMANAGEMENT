# Render administrator recovery update report

## Change made

- Added an opt-in, one-time production password rotation for the existing `admin@school.local` administrator.
- Rotation requires `ROTATE_LEGACY_ADMIN_PASSWORD=true`, `INITIAL_ADMIN_EMAIL=admin@school.local`, and a new `INITIAL_ADMIN_PASSWORD` of at least 16 characters meeting the application's upper/lowercase, number, and symbol policy.
- Rotation changes only the existing administrator's password hash and increments `session_version` to invalidate existing sessions.
- The safeguard still blocks production startup when the legacy default password is active and the one-time rotation is not explicitly enabled.
- Added the optional Render environment variable to `render.yaml` and documented the exact one-time recovery and cleanup steps.

## Preservation

- No data reset, database recreation, or class-arm migration was added.
- The supplied `school.db` and `school_demo.db` were preserved byte-for-byte.
- The uploaded `.neon` file was deliberately excluded from the deliverable because it may contain connection credentials. No `.env` file or database URL is included.

## Verification performed

- Python syntax compilation passed for `app.py`, `database.py`, and `storage.py`.
- Targeted SQLite test passed: the password-hash/session-version update leaves a separate class-arm record unchanged.
- `package.json` and `package-lock.json` dependency declarations match (65 dependencies).
- ZIP integrity and credential-exclusion checks are performed on the final archive.

## Not verified in this environment

- Flask, Werkzeug, psycopg, and psycopg-pool are not installed in this execution environment, so a full Flask/Gunicorn runtime test was not possible.
- `npm ci` did not complete before the environment timeout, so a fresh frontend build was not verified here. The dependency manifests are in sync, and the existing Dockerfile rebuilds the frontend during deployment.
- No live Neon connection or Render deployment was performed. The actual password rotation is only confirmed after the updated service starts successfully on Render.
