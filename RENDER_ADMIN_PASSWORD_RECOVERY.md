# Render: safely rotate the existing default administrator password

The production startup guard detected that the existing `admin@school.local` account still has the legacy `Admin123!` password. This project now supports a narrowly scoped, one-time rotation without deleting or recreating school records.

## Before deploying

1. In Render, open the existing web service and its Environment settings.
2. Set `INITIAL_ADMIN_EMAIL` to `admin@school.local` for this one-time recovery.
3. Set `INITIAL_ADMIN_PASSWORD` to a new, unique password of at least 16 characters with uppercase and lowercase letters, a number, and a symbol. Do not reuse `Admin123!`.
4. Set `ROTATE_LEGACY_ADMIN_PASSWORD` to `true`.
5. Save the environment changes and deploy the updated commit.

The startup routine updates only the password hash and increments the existing administrator's session version (which invalidates prior sessions). It does not delete, recreate, or overwrite `records`, including the saved class arm. It also refuses to rotate if the legacy account is not active with the Admin role or if `INITIAL_ADMIN_EMAIL` points elsewhere.

## After the first successful deployment

1. Confirm the service is healthy and sign in as `admin@school.local` using the new `INITIAL_ADMIN_PASSWORD`.
2. In Render Environment settings, remove `ROTATE_LEGACY_ADMIN_PASSWORD` (or set it to `false`). Keep `INITIAL_ADMIN_PASSWORD` stored securely if you want it available for a future first-time bootstrap; it is not used to overwrite an existing administrator password during normal startup.
3. Redeploy once after removing the rotation flag.
4. Change the administrator email through the app's authorized account/email-change workflow if you want to use your regular school email. Do not create a second administrator merely to change the login email.

## Important

- Do not delete or reset the Neon database.
- Do not set `ALLOW_SQLITE_IN_PRODUCTION=true`; the app should continue using PostgreSQL/Neon.
- Do not share `DATABASE_URL`, `.neon`, `.env`, or the new password in chat or source control.
- The password rotation cannot be confirmed against the live Neon database from this local source archive; Render must run the one-time migration successfully.
