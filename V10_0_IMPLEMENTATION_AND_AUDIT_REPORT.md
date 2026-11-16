# V10.0 — Existing-feature audit and coordinated integrity update

## Starting source

- Source archive: `school_management_v9_5_0_payment_notifications.zip` uploaded in this conversation.
- The source ZIP passed its archive integrity check before extraction.
- This update deliberately inspected the existing implementation before adding anything. Existing workflows were retained instead of duplicating their tables, pages or routes.

## Audit: what was already present

| V10.0 area | Existing implementation found | Outcome |
|---|---|---|
| Results and report cards | Subject-teacher result entry; assignment-scoped result access; Form Teacher review/correction requests; Admin/Principal review after Form Teacher approval; report-card closing-period publication; permanent report-card archive and search | Existing feature retained. Workflow tests still need to be run with Flask and verified in a live browser. |
| Classes, subjects and promotion | JSS1–SS3 class-arm rules; SS2/SS3 Science, Art and Commercial tracks; compulsory/optional subject rules; student subject selection and change requests; class-arm reassignment; promotion history | Existing feature retained. Promotion API received additional server-side progression/date/track checks. |
| Academic sessions and terms | Session and term tables/UI; date validation; overlapping-term rejection; Open → Examinations → Closing → Finished progression; finished-term reactivation blocked | Existing feature retained; no duplicate academic calendar was created. |
| Admissions, students and parents | Public admission applications, Admin review/scheduling/admission, student registration number allocator, parent/student email linking and multiple guardian contact fields, account invitation and recovery routes | Existing feature retained. End-to-end account linking and admission testing remains required. |
| Attendance and timetables | Form Teacher class attendance, Admin staff attendance, attendance history, class/teacher timetable pages and server-side assignment checks | Existing feature retained. |
| Documents and permissions | Student document upload/read policies, class-teacher scope, parent/student linked-student checks, private-file access checks, curriculum document review | Existing feature retained. Role-by-role live permission tests remain required. |
| Security and deployment | Primary Admin protections, temporary staff privileges, additional Teacher/Parent portals, emergency handover, audit logging, PostgreSQL/Neon storage and Render deployment configuration | Existing implementation retained. Live hosting and restore tests remain required. |
| Offline-first operation | No service worker, IndexedDB store, trusted-device offline login, durable mutation outbox, reconnect sync engine or conflict-resolution workflow exists in the supplied source | **Not implemented.** It is not safe to label the current app offline-ready or to add a superficial cache and call it offline synchronisation. This remains a substantial, separate engineering requirement. |

## Changes actually made in V10.0

### 1. Payment notifications now support all recorded guardians

- The previous payment-notification helper used only the single `guardian_email` field. It now uses the existing multi-contact normalizer, which recognises the supported guardian/parent email fields and lists.
- On approval, the student and every linked guardian with an active portal account receive an in-app notification with the appropriate student or parent finance destination.
- Email is sent to all recorded guardian email addresses. The student's email is used only when no guardian contact is recorded.
- On rejection, the student and every linked guardian receive in-app notifications and the relevant email recipients receive the rejection reason and a link to the finance area.
- The existing Bursary-only decision endpoint and Principal read-only payment-history access are preserved.

### 2. Promotion integrity is enforced by the backend

- Promotion dates must be valid ISO dates and fall within the selected academic session.
- A student can only be promoted to the next level in the JSS1 → JSS2 → JSS3 → SS1 → SS2 → SS3 sequence. Same-level arm changes must use the class-arm reassignment workflow.
- Students cannot be promoted into inactive class arms.
- SS1 → SS2 requires a configured Science, Art or Commercial track.
- SS2 → SS3 preserves the existing track. A client-supplied override flag can no longer bypass this protection.
- Existing promotion history and student records are updated using the existing workflow; no table reset or new duplicate promotion system was introduced.

### 3. Regression tests and documentation

- Replaced stale tests that still expected Principal approval of individual bank-transfer receipts. Tests now assert Bursary-only receipt decisions while retaining the separate Principal approval for proposed school bank-account changes.
- Added workflow tests for student/guardian rejection notifications, student-email fallback when no guardian is recorded, sequential promotion and SS2-to-SS3 track preservation.
- Updated README finance instructions so they no longer contradict the V9.5 Bursary approval workflow.
- Explicitly documented that offline-first data entry and synchronisation are not yet available.
- Updated package version metadata to 10.0.0.

## Data and deployment safety

- `school.db` SHA-256 before/after: `06fda89032c41f6759254259f6985415a8992ac48d45a3d7a1aee4edac469716` (unchanged).
- `school_demo.db` SHA-256 before/after: `a7fe5be82a18463962c4f2e4e585315e66f5053027f4d3e82e935c94aaf8ea23` (unchanged).
- No schema migration was needed for these changes.
- Dockerfile, Render configuration, database/storage implementation and dependency versions were not changed.
- No live database, Render service, email provider or payment account was accessed.
- No real `.env` file or live credentials were added.

## Verification

- PASS — Python compilation: `app.py`, `database.py`, workflow tests, database tests, storage tests and PostgreSQL smoke-test module.
- PASS — Existing database translation suite: 11 tests.
- PASS — Existing storage suite: 5 tests.
- PASS — Total executed tests: 16 passed.
- PASS — Source SQLite database files remained byte-for-byte unchanged.
- NOT RUN — `tests/test_workflows.py`: Flask/Werkzeug is not installed in this environment. The new workflow tests are included but have not been executed here.
- NOT RUN — Vite production build/lint: the archive has no installed `node_modules`; dependencies could not be verified locally.
- NOT RUN — Live PostgreSQL/Neon migration, Render deployment, browser role tests, guardian email delivery, print dialog and payment-provider callbacks.

## Deployment and remaining work

Do not treat this ZIP as production-certified. First run the included backend workflow suite in the project's normal virtual environment, run the Vite build, then test on a preview deployment connected to a separate Neon branch/database. Test the full academic workflows with dedicated accounts before promoting the same tested build to production.

The principal outstanding V10 requirement is a genuine offline-first architecture: trusted-device enrolment, protected local data storage, IndexedDB outbox, idempotent mutation replay, server sync cursors/versioning, conflict detection/resolution, retry handling, and clear pending/error/last-sync status. It must be designed and tested as a connected system; browser caching alone is not sufficient.
