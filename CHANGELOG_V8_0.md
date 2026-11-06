# V8.0 coordinated update

## Implemented in this package
- Portal Accounts server-side search by email, name, role, status and account ID, with role/status filters, total counts and 25/50/100 pagination.
- Added supporting SQLite indexes for portal-account lookup and filtering.
- Added Paystack server-side transaction initialization, verification and signed webhook handling. The server calculates configured fees and verifies NGN amount/currency before creating an official Payment record.
- Added a Pay online with Paystack action beside the retained manual bank-transfer receipt submission.
- Added official school-branded payment receipt printing / Save as PDF for approved payment records in Parent and Student Finance history.
- Added Paystack environment configuration notes and deployment instructions.
- Updated package version to 8.0.0.

## Configuration required
- Set `PAYSTACK_SECRET_KEY` in the Flask server environment; begin with a Paystack test key.
- Set `PUBLIC_BASE_URL` to the externally reachable application URL.
- Configure Paystack webhook URL to `/api/payments/paystack/webhook` on the deployed HTTPS domain.
- Configure the school name, logo, address and contact information under Admin → School Settings for branded receipts.

## Verification limits
- Source syntax, SQLite migration, local API authorization/search and frontend production build should be tested before release.
- Live Paystack checkout/webhook settlement cannot be tested without school-owned Paystack credentials and a public HTTPS callback.
- Other V8.0 specification sections build on existing V7.0 features; this changelog does not claim that every optional enhancement in all 16 sections has been newly implemented or externally certified.
