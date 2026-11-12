# Nigerian School Management System — V9.0 Flask Release

This package keeps the supplied React/Vite application as its frontend and runs the API and authentication through Flask. Set `DATABASE_URL` to use PostgreSQL (including Neon); if it is blank, the app uses SQLite for local fallback and tests. The original page/component files, layout, navigation and styling are retained; `src/api/base44Client.js` is now a compatibility adapter that sends the existing page calls to `/api`.

## PostgreSQL and Neon database setup

The app applies its existing additive schema upgrades and indexes when it starts. Production now requires PostgreSQL and refuses a silent SQLite fallback. A PostgreSQL URL takes precedence over `SCHOOL_DB_PATH`; without `DATABASE_URL`, local development uses SQLite. A new PostgreSQL database starts with the application's schema and initial administrator, not the contents of an existing SQLite database. Existing SQLite records are not automatically migrated.

Use two separate Neon projects or databases:

- **Development:** put the development database URL in your local `.env` as `DATABASE_URL`.
- **Production:** add the production database URL as the Render service's `DATABASE_URL` environment variable. Do not copy the development URL into Render.

Neon URLs should use TLS, for example `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`. Keep the actual URL private: never put it in Git, a `VITE_*` setting, screenshots, or frontend code. Start from `.env.example`; do not commit `.env`. Use separate strong database passwords, and rotate a URL if it is accidentally exposed.

For local SQLite-only tests, leave `DATABASE_URL` blank. To check a Neon development database locally, set its URL in `.env` and restart Flask. The app does not import records from SQLite; use only the fresh database as requested, and keep the old database untouched until you confirm the new deployment.

Uploads can use local files in development or a private S3-compatible bucket in production. For Render Free, configure `UPLOAD_STORAGE=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_ENDPOINT_URL`; `S3_REGION` and `S3_PREFIX` are also configurable. Cloudflare R2 is the recommended initial provider; Backblaze B2 and AWS S3 can also be used because the adapter remains S3-compatible and provider-neutral. Keep the bucket private: the Flask route checks the user's authorization before reading an object. Do not put bucket credentials in React or `VITE_*` variables.

## GitHub and online hosting

GitHub is suitable for storing this source code and running the included automated checks; **GitHub Pages cannot host this complete application** because it needs a live Flask API, authentication, and a writable database. The repository runs tests, lint, and build checks on GitHub Actions; deployment is handled by Render, not a GitHub Pages workflow. Use a Docker-capable application host for the full system. The included `Dockerfile` builds the React frontend and serves it with Flask/Gunicorn.

For a Render test deployment:

1. Keep this GitHub repository public or change it to private in GitHub Settings if you prefer to limit access to the source code. Public visibility means anyone can view the application code and documented local demo credentials; it does not include your local `.env`, databases, uploaded school documents, backups, editor settings, or generated dependencies, which `.gitignore` and `.dockerignore` exclude. Check the staged file list before every push; never commit real student records, production uploads, SMTP credentials, or payment secrets.
2. Create separate Neon development and production databases. Put the **development** `DATABASE_URL` in your local `.env`; keep the **production** URL for Render only. The project creates a fresh schema on startup and does not migrate SQLite records.
3. Create a private S3-compatible bucket and access key with only the permissions needed to read, write and delete objects in that bucket. In Render, create a Blueprint from this repository and use `render.yaml`. Enter the production `DATABASE_URL` and object-storage values when prompted: bucket name, endpoint URL, region, access key ID and secret access key. The Blueprint uses a Free web service with no persistent disk; uploads are stored in the external bucket. Never make the bucket public.
4. During the first Render deploy, supply `INITIAL_ADMIN_EMAIL` and a unique `INITIAL_ADMIN_PASSWORD` of at least 16 characters containing uppercase and lowercase letters, a number, and a symbol. The Blueprint generates `SECRET_KEY` automatically. If you created a regular Web Service instead of a Blueprint, open its **Environment** settings and generate a unique random `SECRET_KEY` of at least 32 characters. Do not use the example placeholder or generate a new value on every deploy. After the first administrator can sign in, remove the initial-admin password variable from Render's environment settings. Production refuses the known local default administrator password.
5. After Render assigns the URL, set `PUBLIC_BASE_URL` to that HTTPS origin. Configure a provider in Admin → School Settings → School email before inviting users; on Render Free use Brevo or Resend API, not SMTP. Add Paystack secrets only if online payments are enabled. Never place secrets in `VITE_*` variables, GitHub source, or frontend files.
6. Verify the host's `/healthz` endpoint, sign in with the first admin, configure school identity and email, send a test email, and test the main workflows with demo data before any real records are entered. The Portal Accounts directory lists invited or registered login accounts; adding a student or staff profile by itself does not create login credentials.

The Render Free service can sleep, but PostgreSQL and bucket objects live outside its temporary filesystem. Configure separate database and object-storage backups and periodically test a restore before entering real school data; the application does not claim that a live Neon database or an S3 bucket is itself a backup. GitHub Actions runs the SQLite regression suite, SQL translation tests, a PostgreSQL service smoke test, frontend lint, and Vite build on pushes and pull requests. See `OPERATIONS_AND_RECOVERY.md` for PostgreSQL pooling, R2 configuration, provider portability, backup/restore and current scaling limitations. For PostgreSQL backups use `python backup_postgres.py` with `pg_dump` installed. See [Render Blueprint configuration](https://render.com/docs/blueprint-spec) and [Render free instances](https://render.com/docs/free).

### Oracle Cloud Always Free VM

The project also includes a Docker Compose deployment for an Oracle Cloud Infrastructure (OCI) Ubuntu VM. It runs the app and Caddy reverse proxy together, stores SQLite/uploads and Caddy's HTTPS certificates in Docker volumes, and obtains HTTPS certificates automatically for your domain. Oracle's Free Tier capacity, eligibility and pricing can change; confirm the selected VM, boot volume, public IP and any other resources are eligible for your account before creating them. Do not rely on free-tier eligibility as a substitute for checking your OCI billing and setting a budget alert.

1. In OCI, create an Ubuntu 22.04 or 24.04 VM. An Ampere A1 VM uses ARM64; the included Docker build is multi-architecture and builds on the VM. Capacity may be unavailable in some regions. Assign a public IPv4 address and use an SSH key. Allow inbound TCP ports 80 and 443 in the VM's subnet security list or attached Network Security Group. Keep SSH (port 22) restricted to your own IP; do not open the app's internal port 10000.
2. Register or use a domain you control and create an `A` record for the exact hostname you will put in `DOMAIN`, pointing to the VM's public IPv4 address. Caddy needs the domain to resolve publicly and ports 80/443 reachable to issue and renew HTTPS certificates. Wait for DNS to resolve before starting the deployment.
3. SSH into the VM. Install Git, Docker Engine and the Docker Compose plugin by following Docker's official Ubuntu installation guide: https://docs.docker.com/engine/install/ubuntu/. Do not install Docker using an unverified script.
4. Clone this repository, then from its project directory copy `deployment/oracle/app.env.example` to `.env`. Edit `.env` with your domain, a unique admin email, and a unique password of at least 16 characters. Generate `SECRET_KEY` with `openssl rand -hex 32`. Protect the file with `chmod 600 .env`; never commit it or share the values. The SMTP and Paystack entries are optional; add real provider credentials only if you intend to test those integrations.
5. From the project directory, start the services:

   ```sh
   docker compose --project-directory . -f deployment/oracle/docker-compose.yml up -d --build
   ```

   The first frontend and backend image build can take several minutes. Check progress with `docker compose --project-directory . -f deployment/oracle/docker-compose.yml logs -f app caddy`. Open `https://YOUR_DOMAIN` after Caddy reports that it has obtained a certificate. Confirm `https://YOUR_DOMAIN/healthz` returns `{"status":"ok"}`.
6. Sign in with the first admin credentials. After verifying that account works, remove `INITIAL_ADMIN_PASSWORD` (and `INITIAL_ADMIN_EMAIL` if you no longer need it) from `.env`, then recreate the app container with `docker compose --project-directory . -f deployment/oracle/docker-compose.yml up -d --force-recreate app`. Set the public application URL to `https://YOUR_DOMAIN` in Admin → School Settings if the app asks for it; the deployment also supplies it as `PUBLIC_BASE_URL`.
7. Test only with demo data first. Use Docker Compose to update the app after pushing changes: `git pull` followed by the same `up -d --build` command. The named `school_data` volume is persistent across container rebuilds, but it is not a backup. Back up the database and uploads off the VM and test restoring them before relying on this deployment.

Use the OCI Console's network security rules as well as the VM firewall if enabled. Only Caddy's web ports 80/443 are published; the Flask/Gunicorn port is private to the Compose network. Keep the OS and Docker images patched, restrict SSH, and do not enter real student data until security, backups, privacy requirements and recovery have been reviewed. This single-VM SQLite setup is for testing and limited evaluation, not high-availability production.

### Netlify free frontend with the Oracle backend

Netlify's Free plan can host this app's built React frontend, but it cannot replace the Flask backend, SQLite database, or file storage. Keep the Oracle VM running as the backend and use a public HTTPS hostname for its Caddy endpoint. Netlify's free plan has usage limits/credits that can change; check the current [Netlify pricing](https://www.netlify.com/pricing/) before publishing.

The Netlify build creates same-site proxy rewrites for `/api/*` and `/uploads/*`, then falls back to the React app for page routes. This preserves the app's relative API URLs, login session cookies, API requests, and uploaded images without adding cross-origin browser access. Netlify proxy requests have a 26-second timeout, so slow operations may fail.

1. Deploy the Oracle backend first using the preceding instructions. Its `DOMAIN` is the backend hostname (for example `api.school.example.com`) whose DNS points to the Oracle VM.
2. In Netlify, import this GitHub repository as a new site. Netlify reads `netlify.toml` for the publish directory (`dist`) and build command (`npm run build:netlify`).
3. Before deploying, add the environment variable `NETLIFY_API_ORIGIN` in the Netlify site settings. Set it to the Oracle backend's HTTPS origin only, such as `https://api.school.example.com` (no path or trailing route). Trigger a new deploy so the build generates the proxy rules.
4. Open the Netlify site's Deploy log and confirm the build succeeds. Visit the Netlify URL and test login, API-backed pages, a small upload, and `/healthz`. Netlify must proxy `/healthz` too only if you need that check on the Netlify hostname; the current rules intentionally proxy only API and uploads, so check health on the Oracle hostname.
5. To have email links open the Netlify frontend, set `PUBLIC_BASE_URL=https://YOUR_SITE.netlify.app` in the Oracle project's `.env` (or use your custom domain assigned to Netlify). Then recreate the backend app container with `docker compose --project-directory . -f deployment/oracle/docker-compose.yml up -d --force-recreate app`. Otherwise links use the Oracle backend URL, which also serves the app directly.

Do not publish the backend secret variables to Netlify; only `NETLIFY_API_ORIGIN` belongs in the Netlify build environment. Keep `SECRET_KEY`, SMTP credentials, and Paystack secrets only on the Oracle VM. Netlify hosts the user interface, not the database or backups.

## Windows installation

Requirements: Python 3.10+ and Node.js 20.19+ (or a current Node LTS release).

1. Extract the ZIP into a normal folder.
2. Run `setup.bat` and allow both Python and npm dependencies to install and Vite to build.
3. Run `start.bat`.
4. Open `http://127.0.0.1:5000`.

Initial local-only administrator:

- Email: `admin@school.local`
- Password: `Admin123!`

This shared demo password is not suitable for school records or a network-facing deployment. Set `DATABASE_URL` to your separate Neon development database when you want local Windows development against PostgreSQL; leave it blank for the SQLite fallback. Set a long private `SECRET_KEY` in `.env` before exposing the server to other devices. For LAN access, set `HOST=0.0.0.0` and allow the selected port through Windows Firewall; only do this on a trusted network.

## Converted application areas

The original React interface is retained, including administration (students, staff, accounts, academics, class arms, subjects, teacher assignments, attendance, results, finance, resources, timetable and settings), teacher dashboards/results/attendance/timetable, bursary, library, student portal and parent portal. The original Base44-style entity calls are routed to Flask for Student, StaffProfile, ClassArm, Subject, Assignment, Attendance, Result, FeeItem, Payment, StaffPayment, LibraryBook, LibraryLoan, Notice, ResourceItem, TimetableEntry, CalendarEvent, SchoolSettings, PortalProfile, PortalRequest, StudentDocument and User records.

The backend supports PostgreSQL through `DATABASE_URL` and SQLite fallback, session authentication, password hashing, server-side role checks, CRUD and bulk CRUD endpoints, local development uploads, and authorization-checked file retrieval.

## Finance and admissions workflows

- Financial approvals for fee changes, salary changes/payments, and curriculum changes are decided by the Principal. The Admin can review non-financial report-publication requests.
- Installments are disabled by default. Bursary can propose enabling installments for each fee; the policy takes effect only after Principal approval. Partial payment amounts are checked against the selected student, fee, session and term. Bank receipts also require Principal review before they become ledger payments.
- The public homepage and admission schedule are editable in Admin settings. Online applications are available only when Admin activates admissions and sets a valid examination date, time and venue. The schedule appears on the public homepage and on each applicant's printable letter. Admin can change an individual appointment from Admin → Admissions; the guardian is emailed about the update when a school email provider is configured. Admin records the result after the exam; passing creates a student record in the least-populated active class arm matching the requested level and track.
- After an application is submitted, the guardian receives an email with the schedule and application details only when a school email provider is configured. The local app does not run an automatic reminder on exam day; keep the server running for the application flow and contact families directly if no email is configured or delivered.

## Local-mode limitations (external services not migrated)

- Google OAuth is not configured. The login screen's Google option is intentionally unavailable until OAuth client credentials and callback URLs are supplied.
- Email delivery is not configured. In development only, a randomly generated verification code is returned when email delivery fails; password reset links are printed to the Flask terminal. Do not expose this mode publicly.
- Local uploads are stored in `uploads/`; production Render configuration requires S3-compatible object storage. The private bucket must be configured by the operator.
- No payment gateway credentials/provider are configured; payment records are local school records only.
- This package is a local Flask conversion of the supplied source, not a production-hosted deployment. Validate every role workflow with test accounts before using real student data. Configure HTTPS, backups, secrets, email, OAuth, and secure file storage before deployment.

## Data and backups

When `DATABASE_URL` is blank, SQLite uses `school.db` (or `SCHOOL_DB_PATH` if set) and local uploads are in `uploads/`. When PostgreSQL is configured, the SQLite backup scripts do not back it up; arrange Neon/provider exports and a separate object-storage backup, then verify restore procedures before using real records. The project does not yet automate or test PostgreSQL/object-store backup restoration.

## Developer mode

Terminal 1: activate `.venv` and run `python app.py`.
Terminal 2: run `npm run dev` and open `http://localhost:5173`. Vite proxies `/api` requests to Flask on port 5000.

## Demo test accounts

Run `start_demo.bat` to launch a separate `school_demo.db` populated with demo accounts, classes/arms, staff, subject teachers, timetables, students/parents, fee schedules and payments, historical results/attendance/payroll, library records, pending approvals, and an admission applicant. This isolated database does not modify `school.db`. The seed script is idempotent and preserves demo workflow progress.

All generated demo accounts use the shared local-only password `DemoSchool2026!`. These accounts are for testing only; change or remove them before exposing the database outside the local test environment. The seeded applicant's print token is `DEMO-LOCAL-ADMISSION-PRINT-TOKEN`; use the Admin admissions page to schedule an exam and test admission.

Run the backend regression suite with `npm run test:backend` (or `.venv\Scripts\python.exe -m unittest discover -s tests -v`). It uses a temporary test database and does not change `school.db` or `school_demo.db`.


## Portal invitation email setup

Portal invitations and verification codes are sent only when an email provider is configured. The app does not send email automatically just because an account is created.

1. In **Admin → School Settings → School email**, choose a provider, configure its credentials and sender email, then click **Save email settings**. Verify your sender address or domain with the provider before sending.
2. For Render Free, use **Brevo API** or **Resend API**; Render blocks outbound SMTP connections on common mail ports. Paste the provider API key into the matching field. For settings that must survive a Free service spin-down or redeploy, add `EMAIL_PROVIDER` (`brevo` or `resend`), `EMAIL_FROM`, and the matching `BREVO_API_KEY` or `RESEND_API_KEY` under the service's **Environment** settings in Render. Gmail SMTP is also blocked on Render Free.
3. **Gmail API** uses Google OAuth rather than an API key: provide an OAuth client ID, client secret, and refresh token authorized for Gmail send access. A short-lived access token alone is insufficient because the app needs to refresh it automatically.
4. Set the **Public application URL** to an address recipients can open. `http://127.0.0.1:5000` works only on that computer; for internet use, enter the deployed HTTPS domain. Alternatively, set `PUBLIC_BASE_URL` in the server environment; it takes precedence over the saved setting. If neither is configured on Render, the app now uses Render's `RENDER_EXTERNAL_URL` automatically. Production requires HTTPS and does not fall back to a request-local address.
5. Click **Send test email** before inviting users. Use **Resend** in Portal Accounts to send an invitation again.

If email is not configured or delivery fails, the Portal Accounts page clearly reports that no email was sent and provides a secure invitation link that an administrator can copy and share. Only in development, a random verification code is returned when email delivery fails; production never issues a fixed fallback code.

Portal Accounts supports permanent deletion as well as deactivation for ordinary portal accounts. Permanent deletion removes the portal User record and matching login credentials, but does not delete the linked student, teacher or parent profile. The seeded primary school administrator (`admin@school.local`) is protected from role changes, deactivation, suspension and deletion.

Email is optional and can be configured later in **Admin → School Settings → School email**. Leave it unconfigured to use manual invitations. When an invitation email cannot be delivered, copy the generated secure invitation link from Portal Accounts and share it directly. Resend generates a fresh invitation link or password-reset link.

The sender's display name is taken from School Settings, while the sender email uses the configured provider sender address. The administrator-only test email checks delivery and the portal URL before inviting families. The same section lists the latest 50 email attempts, including delivery status and failure details; “sent” means the provider accepted the message, not that it reached the recipient's inbox. Logs retain recipient, subject, status, timestamp and error only (not message bodies or credentials). Provider credentials are encrypted in the server database using `SECRET_KEY`; keep that key stable across restarts and backups. Email history is available only to Admin.

Every signed-in role now has **Notifications** settings in its portal (students and parents also have this in their account menu). Users can turn off all school activity emails or select finance, academic, attendance, notices, requests, library, admissions, approvals, and school-operation categories. Email delivery uses the school's selected provider; without a configured provider, preferences still save but activity emails are not delivered. Current email events include fee-receipt approval requests and decisions, payments, approval requests and decisions, published report cards, attendance changes, school notices, portal-request responses, library loan updates, account-role changes, and admission schedule messages. Admission applicants without an existing portal account still receive application confirmation email through the selected provider.

All outgoing messages share a branded HTML layout with a plain-text alternative, the school name, configured address, phone, official email, and (when uploaded) school logo embedded inline. Invitations, verification codes, password resets, payment confirmations, fee reminders, notices, and admission messages retain their own content. Bursary can send fee reminders manually from the Bursary dashboard; reminders list outstanding fees and the academic term and respect portal users' finance-email preference. Reminders are not scheduled automatically.

Academic session and term dates are managed in **Admin → School Settings → Academic period**. Set the session start/end dates and the current term start/end dates there.

After login, users are sent to their role dashboard. The dashboard shortcut in each portal returns to that role's dashboard; the school identity in the sidebar still opens the public homepage. When an authenticated request discovers an expired session, the user is sent to login and returned to the page they were trying to use after signing in.



## V6.5 — Principal usability and account email settings

- Principal landing page now opens on a school overview dashboard. Existing oversight sections remain available.
- Principal student, staff, parent, timetable, fee/payment, notice, approval and request views include search and/or filters, compact grouping and pagination for long lists.
- Principal timetable is presented as a read-only weekly calendar grid.
- Shared Profile & Settings now supports verified login-email changes for all portal roles. The user must re-enter their current password and verify a one-time code sent to the new email. Configure a school email provider before using this feature.
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
- These details are encrypted in the configured database using a Fernet key derived from `SECRET_KEY`. The Bursary → Staff bank details page is the only administrative interface that decrypts and displays staff payout details. The API is restricted to the `bursar` role; Principal and Admin do not get routine access to full account numbers.
- Keep the same strong `SECRET_KEY` across restarts and backups. If it is changed, existing encrypted staff bank details cannot be decrypted. Plan a key-rotation/migration before changing it.

### Profile saving and request actions

- Non-staff profile loading now checks both StaffProfile and PortalProfile records so parent, librarian, bursar and administrator profile details reappear after refresh.
- Optional blank profile fields are stored as NULL rather than invalid empty enum/date strings, preventing profile save validation failures.
- Admin → Student & parent requests uses a dedicated server action for Save response, Mark resolved and Reject. Closing/rejecting requires a response or explanation; successful actions are audited and returned to the UI.

### Operational safeguards and backups

- Login attempts are limited to 10 failures per email/IP pair in a rolling 15-minute window. New registrations require 12+ character passwords with uppercase, lowercase, a number, and a symbol; email verification is required before login.
- Verification and reset tokens are stored hashed and expire; password reset/recovery increments the session version to invalidate existing sessions. Signed-cookie sessions expire after 8 hours; secure cookies are enabled in production.
- Mutating API requests validate a session-bound CSRF token or a trusted browser origin. Production responses set HSTS, and all responses set frame, MIME-sniffing, referrer and permissions-policy headers. CORS is disabled unless exact origins are configured in `CORS_ALLOWED_ORIGINS`.
- Production startup refuses the known development fallback secret. Set a unique, long `SECRET_KEY` and `APP_ENV=production` in the hosting environment.
- Uploads are limited to 10 MB, assigned random names, and validated against decoded image content or PDF/Office/text signatures. This is not antivirus scanning; scan documents at the storage/hosting layer and keep the object bucket private.
- `backup.bat` and `backup_school.py` currently back up SQLite only. They are not a PostgreSQL/Neon or S3 backup solution; provision off-site backups and test restore separately.

### Deployment caveats — not yet production-certified

The code changes add PostgreSQL connectivity and an S3-compatible storage path, but this repository has not yet been certified as a complete production system. Live Neon and bucket credentials were not provided, so real cloud connections are unverified. Automated PostgreSQL/object-store backups and a restore test, administrator two-factor authentication, antivirus scanning, and the full school-workflow end-to-end test matrix remain outstanding. Paystack also needs school-owned credentials and live sandbox verification. Do not use the development OTP fallback or demo accounts with real school users.


## V8.0 additions

- Portal Accounts now uses the authenticated `/api/admin/portal-accounts` endpoint for server-side search, role/status filters and 25/50/100-row pagination. The endpoint returns only the requested page and is protected to Admin/Principal accounts.
- Parent and student Finance pages include Paystack checkout alongside manual bank-transfer receipt submission. Configure `PAYSTACK_SECRET_KEY` on the Flask server (start with a Paystack test secret). The server calculates the fee amount, initializes the transaction, verifies the transaction directly with Paystack, checks NGN amount/currency, and records a payment idempotently.
- Configure the Paystack webhook URL as `https://YOUR-DOMAIN/api/payments/paystack/webhook`. The webhook signature is validated using the Paystack secret. Keep the secret in the server environment only; never put it in React/Vite variables or commit a real key.
- Approved payment records with receipt numbers can be printed or saved as PDF from the Parent/Student Finance payment history. The receipt uses the school identity/logo configured under Admin → School Settings. Manual bank-transfer submissions become printable only after Bursary approval creates the official payment record.
- Paystack live transactions require a valid school Paystack account, test/live credentials, a publicly reachable HTTPS deployment and a configured webhook. These cannot be verified from a local source-code-only test.
