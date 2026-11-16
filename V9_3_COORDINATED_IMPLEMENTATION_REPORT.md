> Historical report for V9.3. The multi-portal limitation recorded below was addressed in V9.4; see [V9.4 coordinated fix report](V9_4_COORDINATED_FIX_REPORT.md) for the later implementation and verification status.

# V9.3 Coordinated implementation report

## Existing functionality preserved

The supplied project already contained encrypted staff bank-detail storage, Bursary-only bank-detail viewing, salary/payment approval records, Principal approval workflows, staff profile settings, a Principal-only handover request flow, and email delivery logs. Those systems were extended rather than replaced.

## Changes made

### 1. Staff permissions and limited Admin access
- Added additive `staff_privileges` storage with grantor, grant date, start date, optional expiry, revocation date and note.
- Added a Primary Admin-only Staff Roles & Privileges panel in Admin → Staff & Assignments.
- Added permanent or date-limited privileges and immediate withdrawal.
- Added backend checks for student registration/editing/deletion, teacher assignment, class/subject management, timetables, staff/student attendance, approval requests, student/parent requests, finance/result/document approvals, admissions, academic sessions, notices, documents, library and staff records.
- Added a restricted-Admin mode. Existing Admin accounts are not silently restricted; the Primary Admin explicitly enables the limit. Once enabled, the account can only use assigned, mapped privileges.
- Moved portal-account role/status management and permanent account deletion to Primary Admin authority. Additional Admin invitations are also Primary Admin-only.
- Added active privilege information to `/api/auth/me` and additional-duty navigation links.

### 2. Emergency Primary Admin succession
- Reframed the existing Principal-led handover as an emergency succession process.
- Requires Principal password re-authentication and a reason explaining the Primary Admin's unavailability.
- Requires an active existing staff successor to accept before completion.
- Completion now updates `school_security_settings.primary_admin_user_id`, which the previous completion path did not do.
- The successor becomes Admin/Primary Admin; the previous owner remains an ordinary Admin; other Admin accounts are not demoted.
- Invalidates the former owner's active sessions and records the transfer in the audit log.
- Candidate list excludes the current owner and inactive accounts.

### 3. Student registration numbers
- Added an additive yearly sequence counter.
- Server generates `SCHOOLCODE/YYYY/NNN`, using the configured school code/initials and admission year.
- Three digits are a minimum width, not a fixed width: 999 is followed by 1000 and 1001.
- Existing matching registration numbers are checked before allocation.
- Manual registration, bulk student creation and successful admission-applicant enrolment use the same allocator.
- Existing student numbers are not rewritten.

### 4. Staff bank details
- Included Admin accounts in staff bank-detail settings.
- Older Principal/Admin/Bursary/Librarian/Teacher logins without a StaffProfile are linked into the staff directory on first bank-details visit, reusing PortalProfile details when available.
- Bursary's staff-bank directory includes accounts that previously had no StaffProfile.
- Existing Fernet encryption remains in place; only the staff member and Bursary endpoint can view full details. Principal approval and Bursary processing workflows were not replaced.

### 5. Email history
- API default changed from 50 to 5 records.
- Added `limit`/`offset` pagination and `X-Has-More`/`X-Next-Offset` response headers. Removed the previous automatic 90-day cleanup so older email history remains available to View more.
- Admin Settings now shows the latest five and a View more history button that loads the next five. Older logs are preserved.

### 6. Deployment and data safety
- Kept the existing Flask/PostgreSQL/Neon production connection setup, Dockerfile, Render Blueprint, health check, storage adapter and environment-variable names unchanged.
- All database changes are additive; no database reset or school-record deletion was introduced.
- The local database files from the supplied ZIP were retained unchanged in the delivered project archive.

## Files changed

- `app.py` — additive schema, registration allocator, staff privileges and restricted Admin enforcement, account-management protections, emergency handover ownership transfer, staff bank account fallback/directory, email history pagination.
- `base44/entities/StaffProfile.jsonc` — allow Admin and generic Staff as staff-directory roles so their profiles can participate in the existing payroll/bank-details workflow.
- `src/pages/AdminStudents.jsx` — removed browser-side student-count registration number generation; backend is now authoritative.
- `src/pages/AdminSettings.jsx` — five-at-a-time email history and View more control.
- `README.md` — updated email-history retention and staff-bank access notes.
- `src/pages/AdminHandoverPage.jsx` — emergency succession reason, clearer ownership transfer flow.
- `src/components/portal/sections/ProfileSection.jsx` — Admin staff bank details option.
- `src/components/bursary/StaffBankDetails.jsx` — no structural rewrite; it continues to use the existing Bursary-only endpoint.
- `src/components/admin/StaffPrivilegesPanel.jsx` — new Primary Admin permission-management interface.
- `src/pages/AdminStaff.jsx` — Primary Admin-only Roles & Privileges and Portal Accounts tabs.
- `src/pages/AdminAccounts.jsx` — Primary Admin guard for direct account-management route.
- `src/components/admin/PortalAccounts.jsx` — Primary Admin can appoint additional Admin accounts.
- `src/components/AppSidebar.jsx` — additional-duty links and compact navigation for restricted Admins.
- `src/components/AppShell.jsx` — preserve the person's main portal while opening a page for an additional assigned duty.
- `src/components/ApprovalPanel.jsx` — delegated approval buttons and dedicated approval-only behavior.
- `src/pages/AdminApprovals.jsx` — new narrow approval page for staff with approval privileges.
- `src/App.jsx` — route for the approval-only page.
- `tests/test_workflows.py` — regression tests for the new workflows.
- `README.md` — updated operating notes and V9.3 report.

## Important limitations and items not claimed as complete

- The supplied app still uses one primary portal role per login. This update adds separate task privileges and restricted Admin access, but it does not yet implement simultaneous Teacher + Parent + Principal portal identities for the same login. The existing teacher assignment system can assign teaching classes to a staff profile, but a Principal/Bursar/Librarian does not automatically gain the complete Teacher portal merely by receiving an Admin task privilege. A separate additive multi-role migration and careful conversion of role checks is still required.
- Some privilege keys route into existing combined pages (for example, the resources page). The backend limits write operations, but those pages were not all split into dedicated single-duty pages. Student promotion management and general reports remain available to full Admin/Principal roles, not as separate limited-privilege keys in this update.
- The emergency succession is a Principal-led emergency route; it does not independently verify a medical/death event. The reason is recorded, the successor must accept, and the Principal's identity is re-authenticated. A pre-nominated successor and external school-board attestation remain possible future safeguards.
- No normal Primary Admin-initiated handover UI was added; the requested emergency Principal succession is the focus of this change.
- The staff bank account fields are available to Admin and the other staff roles. The existing Principal-approval-before-payment and Bursary-processing workflow is retained; it was not replaced with an external bank-transfer API.

## Verification results

- `python -m py_compile app.py database.py tests/test_workflows.py`: PASS.
- Python AST parse of the changed backend and test files: PASS.
- `python -m unittest tests.test_database tests.test_storage -v`: 16 PASS.
- New workflow tests were added but could not be run because Flask/Werkzeug are unavailable in the environment. `pip install -r requirements.txt` failed because package registry DNS/network access is unavailable.
- `npm ci --offline` failed because the local npm cache lacks `is-number`; frontend build and lint could not be run.
- No live Neon credentials, Render deployment access or school login credentials were supplied; live production migration and browser verification were not performed.

**Deployment recommendation:** Do not push directly over the current live service as the first test. Deploy this ZIP to a temporary preview service connected to a separate Neon branch/database, run the added workflow tests there, verify `/healthz` reports PostgreSQL, then deploy the same tested commit to the live service. Never point the preview at the live Neon database for migration testing.

### Additional scope boundary

- The source project does not currently contain a service worker, IndexedDB offline store, durable sync outbox or reconnect/conflict-resolution engine. This V9.3 update does **not** claim offline-first readiness. The previously discussed PWA/offline sync architecture remains unimplemented and requires its own substantial coordinated implementation and device-sync testing.
- The existing Paystack transaction and Principal-approved Bursary workflows were inspected and preserved, not replaced. This update did not change gateway configuration or payment verification.
- The current account model still has one primary portal role per login. Additional task privileges do not yet provide a full simultaneous Teacher + Parent + Principal/Bursary/Librarian portal identity. In particular, assigning a Teacher task permission is not the same as adding the complete Teacher portal to a Principal/Bursar/Librarian account.

### Extra static verification

- TypeScript JSX parser transpilation of all 13 changed React files: PASS.
- Entity JSON schema parse: PASS.
- PostgreSQL translation smoke checks for the new tables, upserts, counter allocation and JSON lookup queries: PASS.
- SQLite counter SQL smoke check confirmed `999 → 1000 → 1001`: PASS.
