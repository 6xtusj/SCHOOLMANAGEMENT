# V7.0 — Coordinated finance, profiles, requests and readiness update

## Implemented in this package

- Additive SQLite migration for school payment accounts, encrypted staff bank details and login attempt tracking. Existing records are not deleted or reset.
- Bursary can propose school bank accounts. They remain pending until Principal/Admin approval. Parents and students can view approved accounts in Finance.
- Existing manual fee-transfer evidence flow remains the payment submission path. A receipt does not become a Payment until the bursary approves it.
- Staff can save their own bank details from Profile & Settings. Details are encrypted at rest with Fernet and exposed to the Bursary role only through a dedicated endpoint and page.
- Principal can approve/reject pending school payment account proposals in the existing approvals section.
- Bursary now has School bank accounts and Staff bank details tabs and sidebar entries.
- Profile page now loads PortalProfile as well as StaffProfile; this fixes non-staff profile values disappearing after refresh. Empty optional enum/date fields are saved as NULL rather than invalid empty strings.
- Admin request actions use a dedicated API endpoint, report server errors, update the visible record after success, and audit the decision.
- Login failure throttling, persistent session lifetime, secure-cookie production setting, production secret-key guard, file extension/size restrictions and a database-plus-uploads backup utility.
- Existing portal layouts, navigation patterns, principal search/pagination/calendar and previous academic/approval workflows are retained.

## Validation performed

- Python syntax compilation for `app.py` and `backup_school.py`.
- TypeScript compiler JSX/JS transpilation syntax check across `src/`.
- SQLite schema creation test for the V7 tables and indexes on a disposable copy.
- Fernet encryption/decryption round-trip test using a derived key.
- Backup utility test against the supplied database; archive integrity and included SQLite integrity checked.
- ZIP archive integrity checked after packaging.

## Not verified / deployment blockers

- Flask runtime and live route tests could not run in this environment because Flask is not installed and package downloads are unavailable.
- Vite production build and browser end-to-end tests could not run because npm dependencies are not cached and registry access is unavailable.
- SMTP delivery and verified email changes require the school's SMTP configuration and a live mailbox test.
- Payment account approval and bank-detail access controls have source-level checks but still require live multi-role testing.
- No payment gateway, automatic bank-statement reconciliation, antivirus scanning, production hosting, HTTPS certificate or WSGI deployment is configured by this ZIP.

Do not describe this release as production-certified until those checks and deployment tasks are completed.
