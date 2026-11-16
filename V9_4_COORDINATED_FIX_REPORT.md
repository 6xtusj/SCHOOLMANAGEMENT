# V9.4 coordinated fixes — implementation and verification report

## Scope completed in this update

This update addresses the five issues reported after V9.3 as one coordinated change. It is additive: it does not reset school records, rewrite existing registration numbers, replace the PostgreSQL connection/storage setup, or change the existing page design.

### 1. Staff can correct or change their own salary bank details

- Kept the existing encrypted `staff_bank_details` store and staff/Bursary privacy boundary.
- Staff now submit a bank-detail change from **Profile & settings → My payment details**.
- New and changed details are encrypted before being stored as a pending request. The currently approved bank details remain active until Bursary approval.
- The Bursary reviews requests at **Bursary → Staff bank details → Bank-detail changes awaiting review**.
- Bursary can approve or reject and leave an optional note. The staff member receives an in-app notification and an email if the school's email service and their email preferences permit it.
- Only Bursary can decrypt the submitted request details. Staff can see their own approved details. The Principal approval/payment workflow does not expose full account numbers to the Principal.
- A staff member cannot submit a second change while one is pending. A Bursary user cannot approve their own change. A partial unique index also protects against two simultaneous pending submissions.

### 2. Additional Teacher and Parent portals for staff accounts

- Added an additive `user_portal_roles` table. The existing primary role remains unchanged.
- In **Admin → Portal accounts → Additional portals**, the Primary Admin can grant or withdraw Teacher and Parent portals for active staff accounts.
- A Principal, Admin, Bursar, Librarian or other eligible staff member can switch between their primary portal and an assigned Teacher/Parent portal using the portal selector in the top bar.
- A staff account with an existing subject or Form Teacher assignment automatically has the Teacher portal available; the assignment is checked against the login email. If that person is already signed in when the assignment is saved, refresh their portal page to reload the available portal list.
- A staff member linked to a child through the child's guardian/parent email automatically has Parent portal availability. An explicit Parent portal grant can also be stored. For the child to appear in the Parent portal, the child's guardian email must match the staff member's login email.
- Student accounts are not combined with staff/parent portals. Removing an additional portal does not change the primary role.
- Grant and withdrawal actions are audited. A revoked portal can be granted again later.

### 3. Portal-account primary-role update response

- The primary-role update was already committed before the post-update account notification was sent. If the encrypted school email configuration could not be read, the email dispatch could raise after the database change, causing the browser to show a 500 even though the role had changed.
- Email configuration lookup and notification delivery are now failure-safe. A mail-configuration problem is logged and recorded as an email-delivery failure; it no longer turns a successful account-role update into a failed API response.
- Existing Primary Admin protections remain in place.

### 4. Notification-preferences loading failure

- Notification preferences now tolerate malformed stored preference JSON and an unavailable/undecryptable email-provider configuration.
- The preferences page still loads and saves email choices when the email provider needs attention. It shows a warning rather than failing the whole page.
- In-app alerts are stored independently of email preferences. Turning off email does not hide an approval or school-office alert inside the app.

### 5. In-app alerts and approval notifications

- Added persistent in-app notifications, unread counts, mark-read and mark-all-read endpoints.
- Added a notification bell to the shared portal header. It displays unread counts, opens recent alerts and shows a toast popup when new alerts arrive while the portal is open.
- Financial approval requests alert the Principal for the decision and alert Admin/Bursary about the pending workflow (excluding the person who submitted the request).
- Fee-transfer receipt submissions alert the Principal, Admin and Bursary; the Principal remains the approver.
- Proposed school bank-account changes alert the Principal and Admin; the Bursary requester is notified when the Principal approves or rejects the proposal.
- New general student/parent requests alert Admin and Principal. Finance/bank-related requests also alert Bursary.
- New admission applications alert Admin and Principal. Staff bank-detail changes alert Bursary.
- Email is sent as well when the email provider is configured and the recipient's email preferences allow that category. In-app alerts remain available regardless.

## Where to find the earlier features already in the project

These were present in the supplied V9.3 project before this update; they were not recreated:

| Earlier request/feature | Where to find it |
|---|---|
| Give staff limited or temporary duties/permissions | **Admin → Staff & Assignments → Roles & privileges** (Primary Admin only) |
| Manage portal accounts and primary roles | **Admin → Portal accounts** |
| Emergency Primary Admin succession | **Emergency succession** in the Principal/Admin sidebar (route `/admin/handover`). The Principal starts it; the proposed successor accepts; the Principal completes the transfer. |
| School registration-number initials | **Admin → School Settings → School initials (used in admission numbers)**. The yearly counter generates the `SCHOOLCODE/YYYY/NNN` sequence and continues with 1000 after 999. |
| Email delivery history and older records | **Admin → School Settings → Email history**; use **View more history** to load the next five. |
| Encrypted staff-bank-details storage and Bursary-only full-number access | **Profile & settings → My payment details** and **Bursary → Staff bank details**. This V9.4 update adds the change-request/approval workflow. |

## Files changed in V9.4

- `app.py` — additive schema for portal roles, in-app notifications and bank-change requests; active portal-role resolution and switching; safer email configuration/dispatch; notification inbox APIs; bank-detail review workflow; expanded approval/request alerts.
- `src/components/AppShell.jsx` — portal switcher and notification bell in the shared header.
- `src/components/NotificationBell.jsx` — new unread-count, dropdown inbox and toast popup.
- `src/components/AppSidebar.jsx` — discoverable Emergency succession links for Admin and Principal.
- `src/components/admin/PortalAccounts.jsx` — Primary Admin controls for additional Teacher/Parent portals.
- `src/components/portal/sections/ProfileSection.jsx` — staff bank-detail change submission and pending-review state.
- `src/components/bursary/StaffBankDetails.jsx` — Bursary review/approve/reject interface for staff bank changes.
- `src/components/portal/sections/NotificationsSection.jsx` — resilient email-preference page and email-service warning.
- `tests/test_workflows.py` — regression tests for bank-change approval, notification resilience/inbox, multi-portal switching and primary-role update behavior.
- `.gitignore` — excludes local environment files, databases, uploads, backups, dependency folders and generated Python/build files from Git while retaining `.env.example`.
- `V9_4_COORDINATED_FIX_REPORT.md` — this report.
- `README.md` — points to this update report and clarifies the new workflow locations.

## Data, security and deployment safeguards

- Existing `school.db` and `school_demo.db` in the supplied archive were compared with the original archive and are byte-for-byte unchanged.
- `Dockerfile`, `render.yaml`, `requirements.txt`, `database.py`, `storage.py`, `.neon`, `start.bat` and `setup.bat` are unchanged.
- New tables and indexes are created with additive `CREATE TABLE/INDEX IF NOT EXISTS` statements at startup. No drop, truncate, or database reset was introduced.
- Existing encrypted staff-bank-detail data is not rewritten by the migration.
- No `.env`, database URL, SMTP password, API key or other live credential was added to the ZIP. `.env.example` remains the template.
- The new `.gitignore` helps prevent local databases, uploads and secrets from being staged to GitHub. Still inspect the staged file list before committing.

## Verification results

**PASS** `python -m py_compile app.py database.py tests/test_workflows.py tests/test_database.py tests/test_storage.py tests/postgres_smoke.py`

**PASS** Existing database/storage unit suite: `python -m unittest tests.test_database tests.test_storage -v` — **16 tests passed**.

**PASS** TypeScript's JSX parser successfully transpiled all seven changed React components/pages listed above; this checks JSX syntax, not a full Vite build.

**PASS** SQLite smoke checks validated the new notification/portal-role/bank-request table definitions, teacher-assignment and guardian-email lookups, portal-role revoke/regrant, and the one-pending-bank-change constraint.

**PASS** PostgreSQL query-translation smoke checks validated the new JSON lookups and expression-index SQL through the project's SQLite-to-PostgreSQL translator.

**PASS** Existing local database files and deployment/storage configuration files listed above were byte-for-byte compared against the original ZIP and were unchanged.

**NOT RUN** Flask workflow tests could not execute because Flask is not installed in this environment (`ModuleNotFoundError: No module named 'flask'`). Package installation could not reach the package registry because DNS/network access is unavailable. The new workflow regression tests are included for execution on the user's machine or CI.

**NOT RUN** Full Vite production build/lint and live Render/Neon/browser tests were not possible because frontend dependencies are not installed here and no live deployment credentials/session were supplied. Do not treat this ZIP as live-deployment verified.

## Important operating notes

- After extracting this ZIP over a backed-up copy of the project, install the normal project dependencies and run the workflow test suite before deploying.
- Use a separate Neon test branch/database for the first deployment test. Do not point a preview service at the live school database.
- If the Notifications page reports that email is unavailable, in-app notifications will still work. The email service may need its original `SECRET_KEY` restored (encrypted saved mail settings depend on it) or the email provider reconfigured in Admin → School Settings.
- The notification bell polls for new alerts while a portal is open. A user who is not signed in will receive no in-app popup; email delivery depends on configured email and user preferences.
