# V8.0 verification report

## Changes included
- Portal Accounts now has server-side search (email, name, role, status and account ID), role/status filters, sorting and 25/50/100 pagination.
- Added Paystack transaction initialization, server-side verification, amount/currency matching, duplicate prevention, signed webhook handling and payment-ledger creation.
- Added Paystack online checkout beside the existing manual transfer receipt workflow.
- Added a school-branded print / Save as PDF receipt action in Parent and Student payment history for recorded approved payments.
- Added Paystack configuration and deployment instructions; retained the supplied V7.0 database unchanged.

## Checks performed
- `python -m py_compile app.py`: PASS.
- TypeScript compiler JSX parser over 157 JavaScript/JSX source files: PASS, zero syntax diagnostics.
- SQLite Paystack transaction table and supporting index DDL on a disposable copy of the supplied database: PASS.
- SQLite portal-account search and role/status filtering against 10,000 simulated accounts: PASS. A unique email/name query returned the matching record; test query elapsed time was approximately 0.20 seconds in this environment. This is a focused local data test, not a production load benchmark.
- Original supplied `school.db` byte comparison: PASS; working ZIP database remains unchanged.
- Real secret values: none added to the package.

## Checks not completed / limitations
- Flask runtime/API tests could not be run in this environment because Flask/Werkzeug are not installed and package installation was blocked by unavailable network access. Python syntax compilation passed, but this is not a substitute for a live Flask test.
- Vite production build and ESLint could not be run because npm dependency installation timed out due unavailable network access. JavaScript/JSX parsing passed, but imports, bundling and lint rules remain to be verified on the Windows machine with `setup.bat`.
- Paystack checkout, webhook delivery, bank settlement and live receipt callback require the school's Paystack test/live credentials and a publicly reachable HTTPS deployment. These have not been live-tested.
- Flutterwave is not integrated in this release; the requested future-provider option remains a later extension.
- The broader 16-section V8.0 scope also contains capabilities already present in V7.0. This package preserves those existing areas, but it does not claim every additional recommendation in all 16 sections was newly implemented or independently end-to-end verified.
- The uploaded V7.0 ZIP did not contain an `uploads/` directory. The code creates it on startup; files stored only on the user's PC are not in this ZIP and must be backed up separately before replacing any local project folder.

## Before using with real school data
1. Back up the existing local `school.db` and `uploads/` folder separately.
2. Run `setup.bat` on Windows to install dependencies and build the frontend.
3. Run the app locally and test every portal.
4. Configure `PAYSTACK_SECRET_KEY` as a server-side environment secret using Paystack test credentials.
5. Deploy behind HTTPS, set `PUBLIC_BASE_URL`, configure the Paystack webhook, and test the complete payment lifecycle before switching to live keys.
