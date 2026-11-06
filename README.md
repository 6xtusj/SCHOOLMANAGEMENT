# Nigerian School Management System — V8.0 Flask Release

This package keeps the supplied React/Vite application as its frontend and replaces the Base44-hosted data/authentication layer with a local Flask + SQLite service. The original page/component files, layout, navigation and styling are retained; `src/api/base44Client.js` is now a compatibility adapter that sends the existing page calls to `/api`.

## GitHub and online hosting

GitHub is suitable for storing this source code and running the included automated checks; **GitHub Pages cannot host this complete application** because it needs a live Flask API, authentication, and a writable database. Use a Docker-capable application host for the full system. The included `Dockerfile` builds the React frontend and serves it with Flask/Gunicorn.

For a test deployment:

1. Create a **private** GitHub repository and push this project. `.gitignore` and `.dockerignore` exclude `.env`, databases, uploaded school documents, backups, and generated dependencies. Check the staged file list before every push; do not add real student records, production uploads, SMTP credentials, or payment secrets.
2. Deploy the repository as a Docker web service on a host that supports a persistent disk/volume. Mount it at `/var/data`; the database and uploaded files are stored there. The service expects one running instance; do not scale it horizontally with SQLite.
3. Configure `APP_ENV=production`, `SECRET_KEY` (a unique random value of at least 32 characters), `PUBLIC_BASE_URL` (the deployed HTTPS origin), and `INITIAL_ADMIN_EMAIL` plus a unique `INITIAL_ADMIN_PASSWORD` of at least 16 characters for the first boot of a new persistent database. The bootstrap email/password can be removed after the administrator is created. Production refuses the known local default admin password.
4. Configure SMTP secrets in the host environment before inviting users. Add Paystack secrets only if online payments are enabled. Never place secrets in `VITE_*` variables, GitHub source, or frontend files.
5. Verify the host's `/healthz` endpoint, sign in with the first admin, configure school identity and email, send a test email, and test the main workflows with demo data before any real records are entered.

Keep an independent backup of the host's persistent volume. A persistent volume is not a backup, and the current SQLite deployment is for controlled testing rather than a multi-instance/high-availability production rollout. GitHub Actions runs the backend tests, frontend lint, and Vite build on pushes and pull requests.

## Windows installation

Requirements: Python 3.10+ and Node.js 20.19+ (or a current Node LTS release).

1. Extract the ZIP into a normal folder.
2. Run `setup.bat` and allow both Python and npm dependencies to install and Vite to build.
3. Run `start.bat`.
4. Open `http://127.0.0.1:5000`.

Initial local administrator:

- Email: `admin@school.local`
- Password: `Admin123!`

Change this password before using real data. Set a long private `SECRET_KEY` in the environment before exposing the server to other devices. For LAN access, set `HOST=0.0.0.0` and allow the selected port through Windows Firewall; only do this on a trusted network.

## Converted application areas

The original React interface is retained, including administration (students, staff, accounts, academics, class arms, subjects, teacher assignments, attendance, results, finance, resources, timetable and settings), teacher dashboards/results/attendance/timetable, bursary, library, student portal and parent portal. The original Base44-style entity calls are routed to Flask for Student, StaffProfile, ClassArm, Subject, Assignment, Attendance, Result, FeeItem, Payment, StaffPayment, LibraryBook, LibraryLoan, Notice, ResourceItem, TimetableEntry, CalendarEvent, SchoolSettings, PortalProfile, PortalRequest, StudentDocument and User records.

The backend includes SQLite persistence, session authentication, password hashing, role checks based on the source entity access rules, required-field and basic type/enum validation, CRUD and bulk CRUD endpoints, local uploads, and protected upload retrieval.

## Finance and admissions workflows

- Financial approvals for fee changes, salary changes/payments, and curriculum changes are decided by the Principal. The Admin can review non-financial report-publication requests.
- Installments are disabled by default. Bursary can propose enabling installments for each fee; the policy takes effect only after Principal approval. Partial payment amounts are checked against the selected student, fee, session and term. Bank receipts also require Principal review before they become ledger payments.
- The public homepage and admission schedule are editable in Admin settings. Online applications are available only when Admin activates admissions and sets a valid examination date, time and venue. The schedule appears on the public homepage and on each applicant's printable letter. Admin can change an individual appointment from Admin → Admissions; the guardian is emailed about the update when SMTP is configured. Admin records the result after the exam; passing creates a student record in the least-populated active class arm matching the requested level and track.
- After an application is submitted, the guardian receives an email with the schedule and application details only when SMTP is configured. The local app does not run an automatic reminder on exam day; keep the server running for the application flow and contact families directly if no email is configured or delivered.

## Local-mode limitations (external services not migrated)

- Google OAuth is not configured. The login screen's Google option is intentionally unavailable until OAuth client credentials and callback URLs are supplied.
- Email delivery is not configured. Local account verification uses code `123456`; password reset links are printed to the Flask terminal. This is for development only.
- File uploads are stored locally in `uploads/`; include that directory in backups. They are not cloud replicated.
- No payment gateway credentials/provider are configured; payment records are local school records only.
- This package is a local Flask conversion of the supplied source, not a production-hosted deployment. Validate every role workflow with test accounts before using real student data. Configure HTTPS, backups, secrets, email, OAuth, and secure file storage before deployment.

## Data and backups

SQLite database: `school.db` (or `SCHOOL_DB_PATH` if set). Uploaded files: `uploads/`. Back up both together while the app is stopped. Do not delete `school.db` unless you intend to reset all records.

## Developer mode

Terminal 1: activate `.venv` and run `python app.py`.
Terminal 2: run `npm run dev` and open `http://localhost:5173`. Vite proxies `/api` requests to Flask on port 5000.

## Demo test accounts

Run `start_demo.bat` to launch a separate `school_demo.db` populated with demo accounts, classes/arms, staff, subject teachers, timetables, students/parents, fee schedules and payments, historical results/attendance/payroll, library records, pending approvals, and an admission applicant. This isolated database does not modify `school.db`. The seed script is idempotent and preserves demo workflow progress.

All generated demo accounts use the shared local-only password `DemoSchool2026!`. These accounts are for testing only; change or remove them before exposing the database outside the local test environment. The seeded applicant's print token is `DEMO-LOCAL-ADMISSION-PRINT-TOKEN`; use the Admin admissions page to schedule an exam and test admission.

Run the backend regression suite with `npm run test:backend` (or `.venv\Scripts\python.exe -m unittest discover -s tests -v`). It uses a temporary test database and does not change `school.db` or `school_demo.db`.


## Portal invitation email setup

Portal invitations and verification codes are sent only when SMTP is configured. The app does not send email automatically just because an account is created.

1. Open the `.env` file created by `setup.bat`.
2. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` for your school's email provider. For Gmail, use a Google App Password, not your normal Gmail password.
3. In **Admin → School Settings → School email**, set the Public application URL to the address recipients can open. `http://127.0.0.1:5000` works only on that computer; for other devices on the school network use the host computer's LAN IP, and for internet access use your deployed HTTPS domain. Alternatively, set `PUBLIC_BASE_URL` in the server environment; it takes precedence over the saved setting. Production requires HTTPS and does not fall back to a request-local address.
4. Restart the app if you changed server environment variables. Use **Resend** in Portal Accounts to send an invitation again.

If SMTP is not configured or delivery fails, the Portal Accounts page clearly reports that no email was sent and provides a secure invitation link that an administrator can copy and share. The local verification code is `123456` only in this no-SMTP development mode.

Portal Accounts supports permanent deletion as well as deactivation for ordinary portal accounts. Permanent deletion removes the portal User record and matching login credentials, but does not delete the linked student, teacher or parent profile. The seeded primary school administrator (`admin@school.local`) is protected from role changes, deactivation, suspension and deletion.

SMTP is optional and can be configured later in **Admin → School Settings → School email**. Leave it blank to use manual invitations. When an invitation email cannot be delivered, copy the generated secure invitation link from Portal Accounts and share it directly. Resend generates a fresh invitation link or password-reset link.

The sender's display name is taken from School Settings, while the sender email uses the configured SMTP_FROM address. In School Settings, send an administrator-only test email to verify SMTP delivery and the portal URL before inviting families. The same section lists the latest 50 email attempts, including delivery status and failure details; “sent” means the SMTP server accepted the message, not that it reached the recipient's inbox. Logs retain recipient, subject, status, timestamp and error only (not message bodies or SMTP credentials). Email history is available only to Admin.

Every signed-in role now has **Notifications** settings in its portal (students and parents also have this in their account menu). Users can turn off all school activity emails or select finance, academic, attendance, notices, requests, library, admissions, approvals, and school-operation categories. Email delivery uses the school's configured SMTP account; without SMTP, preferences still save but activity emails are not delivered. Current email events include fee-receipt approval requests and decisions, payments, approval requests and decisions, published report cards, attendance changes, school notices, portal-request responses, library loan updates, account-role changes, and admission schedule messages. Admission applicants without an existing portal account still receive the application confirmation email through the normal SMTP configuration.

All outgoing messages share a branded HTML layout with a plain-text alternative, the school name, configured address, phone, official email, and (when uploaded) school logo embedded inline. Invitations, verification codes, password resets, payment confirmations, fee reminders, notices, and admission messages retain their own content. Bursary can send fee reminders manually from the Bursary dashboard; reminders list outstanding fees and the academic term and respect portal users' finance-email preference. Reminders are not scheduled automatically.

Academic session and term dates are managed in **Admin → School Settings → Academic period**. Set the session start/end dates and the current term start/end dates there.

After login, users are sent to their role dashboard. The dashboard shortcut in each portal returns to that role's dashboard; the school identity in the sidebar still opens the public homepage. When an authenticated request discovers an expired session, the user is sent to login and returned to the page they were trying to use after signing in.



## V6.5 — Principal usability and account email settings

- Principal landing page now opens on a school overview dashboard. Existing oversight sections remain available.
- Principal student, staff, parent, timetable, fee/payment, notice, approval and request views include search and/or filters, compact grouping and pagination for long lists.
- Principal timetable is presented as a read-only weekly calendar grid.
- Shared Profile & Settings now supports verified login-email changes for all portal roles. The user must re-enter their current password and verify a one-time code sent to the new email. Configure SMTP before using this feature.
- Verified email changes update matching school record references and preserve primary administrator ownership by immutable account ID.
- All portal dashboards greet the signed-in user by first name.

## V6.4 portal and oversight update

- Student and parent requests are visible from the Admin and Principal dashboards and the dedicated **Student & parent requests** page. Admin, Principal, Bursary and Library office roles can update request status and write a school response; the response is shown in the originating student/parent portal.
- Document permissions: Admin, Principal and Bursary can upload student-specific school documents; a student or linked parent can upload documents only for that student; teachers can upload syllabus/teaching resources only for their assigned class and subject. Student-specific documents are visible to Admin, Principal and Bursary, the teacher assigned to that class, and the linked student/parent. Resource uploads by teachers remain pending until approved. Private upload retrieval is checked against the record's access rules.
- Teacher workspace additions: assigned-student list with profile view, weekly syllabus writing and document upload, exam schedule, school calendar, school notices and personal profile settings. Form teachers can view fee status for students in their assigned form class.
- Parent overview displays the assigned Form Teacher and Principal contact details. Student subject selection also shows the subjects and allocated teachers.
- Principal portal provides class/arm/track student profiles, staff and salary history, class timetables, parent contacts, fee schedules/collections/outstanding balances, sessions/terms, notices, requests, approvals and audit activity. It is a view-and-approval workspace; timetable editing remains in the Admin workflow.
- Personal Profile & settings is available to Admin, Principal, Teachers, Bursary, Librarian, Parents and Students. Staff details are saved to their staff profile; learner details are saved to their student record.
- Existing page styling and shared layout conventions were retained; the update adds menu entries and content within the existing shell.

Back up `school.db` and `uploads/` before updating, as always. This update uses additive record fields and existing SQLite tables; it does not reset the database.

## V7.0 — finance controls, staff payout details and operational safeguards

### School bank accounts and manual transfers

- The Bursary → School bank accounts page lets the bursar submit school bank account details. New details are not published immediately: they remain pending until the Principal approves them.
- Parents and students see approved school accounts in the Finance section. They can copy the account number and use the existing fee receipt submission workflow to upload transfer evidence.
- A transfer receipt is a claim, not proof of settlement. Only a Principal-approved submission creates the official payment record and changes the recorded balance.
- Account changes should be submitted as a new proposal. The previous approved account remains available until the new proposal is approved. Principal/Admin can reject proposals; deactivation is available through the account decision API.

### Staff bank details

- Staff can enter bank name, account name and a 10-digit account number under Profile & Settings → My payment details.
- These details are encrypted in SQLite using a Fernet key derived from `SECRET_KEY`. The Bursary → Staff bank details page is the only administrative interface that decrypts and displays staff payout details. The API is restricted to the `bursar` role; Principal and Admin do not get routine access to full account numbers.
- Keep the same strong `SECRET_KEY` across restarts and backups. If it is changed, existing encrypted staff bank details cannot be decrypted. Plan a key-rotation/migration before changing it.

### Profile saving and request actions

- Non-staff profile loading now checks both StaffProfile and PortalProfile records so parent, librarian, bursar and administrator profile details reappear after refresh.
- Optional blank profile fields are stored as NULL rather than invalid empty enum/date strings, preventing profile save validation failures.
- Admin → Student & parent requests uses a dedicated server action for Save response, Mark resolved and Reject. Closing/rejecting requires a response or explanation; successful actions are audited and returned to the UI.

### Operational safeguards and backups

- Login attempts are limited to 10 failed attempts per email/IP pair in a rolling 15-minute window.
- Sessions are persistent for up to 8 hours; secure cookies are enabled automatically when `APP_ENV=production` (or explicitly with `COOKIE_SECURE=true`).
- Production startup refuses the known development fallback secret. Set a unique, long `SECRET_KEY` and `APP_ENV=production` in the hosting environment.
- Uploads are limited to 10 MB and an allowlist of image, PDF, Office, TXT and CSV extensions. This is an extension allowlist, not antivirus scanning; keep upload storage private and scan it at the hosting layer.
- Run `backup.bat` (Windows) or `python backup_school.py` to create a ZIP containing a SQLite online-backup snapshot and the `uploads/` directory. Stop the application first when you need the strongest consistency guarantee for files being uploaded. Store copies off the application computer and test restoration periodically.

### Deployment caveats — not yet production-certified

This ZIP is a development release, not a guarantee of production readiness. Before real-school deployment, configure a production WSGI server/reverse proxy, HTTPS, a strong secret, SMTP, monitored off-device backups, malware scanning for uploads, and a production database strategy. Complete live tests with each role and representative high-volume data. V8.0 adds Paystack integration code, but the gateway still requires school-owned credentials, a public HTTPS callback and live sandbox/production verification. Bank-statement reconciliation, multi-user edit conflict handling, antivirus scanning and a complete end-to-end browser test suite still require additional deployment work. Do not use the development OTP fallback or demo accounts with real school users.


## V8.0 additions

- Portal Accounts now uses the authenticated `/api/admin/portal-accounts` endpoint for server-side search, role/status filters and 25/50/100-row pagination. The endpoint returns only the requested page and is protected to Admin/Principal accounts.
- Parent and student Finance pages include Paystack checkout alongside manual bank-transfer receipt submission. Configure `PAYSTACK_SECRET_KEY` on the Flask server (start with a Paystack test secret). The server calculates the fee amount, initializes the transaction, verifies the transaction directly with Paystack, checks NGN amount/currency, and records a payment idempotently.
- Configure the Paystack webhook URL as `https://YOUR-DOMAIN/api/payments/paystack/webhook`. The webhook signature is validated using the Paystack secret. Keep the secret in the server environment only; never put it in React/Vite variables or commit a real key.
- Approved payment records with receipt numbers can be printed or saved as PDF from the Parent/Student Finance payment history. The receipt uses the school identity/logo configured under Admin → School Settings. Manual bank-transfer submissions become printable only after Bursary approval creates the official payment record.
- Paystack live transactions require a valid school Paystack account, test/live credentials, a publicly reachable HTTPS deployment and a configured webhook. These cannot be verified from a local source-code-only test.
