# Portal email and account management update

## Why portal invitation emails were missing
The previous standalone implementation only created a pending `User` record. It did not connect to an SMTP server or send any email. The app now sends real invitation and verification emails when SMTP is configured, and it reports delivery failure honestly when it is not.

## New portal account features
- Invite emails contain a unique, single-use registration link that expires after 7 days.
- Registration validates the invitation token and email address.
- Email verification codes are sent when SMTP is configured; no-SMTP local testing uses `123456`.
- Resend sends a fresh invitation for accounts that have not registered, or a password-reset link for accounts that already have login credentials.
- When email is not configured or delivery fails, the admin sees the reason and a copyable secure link.
- Delete permanently removes the portal User record and matching login credentials. The currently signed-in administrator cannot delete their own account.
- Deactivation remains available and is reversible; deletion is permanent.

## Required email setup
Edit `.env` and set SMTP host, port, TLS/SSL mode, SMTP username, SMTP password/app password, sender address, and `PUBLIC_BASE_URL`. Restart the app after editing. For recipients on another device, `PUBLIC_BASE_URL` must be a LAN-reachable address or deployed HTTPS domain; `127.0.0.1` only points to the recipient's own computer.
