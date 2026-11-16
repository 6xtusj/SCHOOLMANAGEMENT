# V9.5.0 — Bursary payment approval and actionable notifications

## Implemented in this coordinated update

### Student fee-transfer approvals
- Fee-transfer receipt submissions now notify the Bursary only for review. The previous notification to the Principal has been removed.
- The payment decision API is protected by `@role_required('bursar')`; a Principal or Admin cannot approve/reject a submitted transfer through this endpoint.
- The Bursary portal now has a dedicated **Fee receipt approvals** tab at `/bursary/receipts`, with a search field for student, admission number, reference, fee or status.
- The Bursary can approve/reject pending submissions from this queue.
- The student-facing submission message now correctly says that the Bursary verifies the receipt.
- The Principal's former receipt-approval page is now a read-only **Student payment history** page. It retains search and record visibility but has no approve/reject controls.

### Approved payment notifications and receipts
- After Bursary approval, an in-app notification is stored for the student's registered portal account and the linked parent's/guardian's registered portal account when their email addresses match active portal accounts.
- Email is sent to the linked parent/guardian when a guardian email is present. If no guardian email is recorded, email falls back to the student's registered email.
- The student and parent/guardian notifications have different destinations: `/student/finance` and `/parent/finance`.
- Approved payment rows in the shared student/parent fee statement now have a **Print receipt** action. It opens a printable receipt containing the receipt number, student/admission details, fee, amount, payment date, method, reference, session, term and approved status.
- Rejected submissions notify the submitting student/parent with a link back to the finance area.

### Notification destinations
- Added an additive `action_url` column to in-app notifications. Existing notification records are preserved.
- The notifications API now returns the destination URL.
- Clicking an in-app notification marks it read and navigates to its internal destination when one is present.
- Added role/category-based default destinations for common finance, staff-bank, school-account, student-request, admission, result, attendance, notice, library, approval and operations notifications.
- Pending student fee receipts link directly to the Bursary receipt-approval queue.

## Data and deployment safety
- No school records or uploaded files were intentionally edited.
- The included `school.db` file remains byte-for-byte unchanged (SHA-256: `06fda89032c41f6759254259f6985415a8992ac48d45a3d7a1aee4edac469716`).
- The notification change is an additive database migration; it adds `action_url` only when the column is absent.
- Dockerfile, Render configuration, dependency manifests and database/storage infrastructure were not changed.
- No production database, Render service, email provider or external payment account was accessed.
- No `.env` or live credentials were added.

## Verification

- PASS: Python compilation of `app.py`.
- PASS: PostgreSQL translation tests — 11 tests.
- PASS: storage tests — 5 tests.
- PASS: TypeScript JSX parser checks for all 7 changed React files.
- PASS: static assertions for Bursary-only payment decisions, removal of Principal approval notifications, Bursary queue, action URL migration/API exposure, student/guardian notification destinations and printable receipt control.
- PASS: ZIP archive integrity check.
- NOT RUN: Flask workflow tests. Flask is not installed in this environment, so `tests/test_workflows.py` could not be imported.
- NOT PASS / NOT RUN: Vite production build. `npm run build` could not run here (`vite: Permission denied`); the archive has no usable local `node_modules` installation.
- NOT RUN: live browser, Render/Neon migration, role-based login, actual email delivery, print-dialog or payment-provider tests. These require the deployed environment and real test accounts.

## Important live-test checklist

1. Sign in as Bursary and submit a test bank receipt from a student/parent account.
2. Confirm only Bursary receives the pending-approval notification and that it opens `/bursary/receipts`.
3. Confirm Bursary can approve/reject; try the same decision while signed in as Principal and confirm the server returns HTTP 403.
4. Confirm Principal can search `/principal/receipt-approvals` but cannot approve or reject.
5. Approve a test payment and confirm both student and linked parent receive in-app notifications; confirm the email goes to the guardian address, or to the student address when no guardian email exists.
6. Open the approved payment from both portals and test **Print receipt**.
7. Click several different notification types to verify their destinations and access permissions. The new destination framework covers common categories, but unusual legacy notification wording should be checked in the live app.

This ZIP implements the payment-approval and notification changes requested in the latest update. It does **not** claim that every remaining item in the wider school-system roadmap has been completed or that the live Render deployment has been verified.
