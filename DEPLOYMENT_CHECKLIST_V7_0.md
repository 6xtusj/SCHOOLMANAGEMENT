# V8.0 deployment readiness checklist

This checklist is intentionally conservative. Do not expose a school system with real student or bank information until each applicable item is completed and evidenced.

## Before hosting

- [ ] Choose a supported production host and managed database/backup plan.
- [ ] Set `APP_ENV=production` and a unique, high-entropy `SECRET_KEY` in the host's secret manager (never commit it).
- [ ] Enable HTTPS and `COOKIE_SECURE=true` (production mode enables secure cookies automatically).
- [ ] Run behind a maintained WSGI server and reverse proxy; do not expose Flask's development server directly.
- [ ] Configure `PUBLIC_BASE_URL` to the final HTTPS domain.
- [ ] Configure a supported email provider and test invitations, email-change verification and password recovery from real external mailboxes. On Render Free, use Brevo or Resend API instead of SMTP.
- [ ] Configure private upload storage, malware scanning, retention rules and restore procedures.
- [ ] Decide the production database strategy and test backups/restore with representative data.

## Access and privacy

- [ ] Change/remove all seeded and demo passwords; remove demo accounts and demo data.
- [ ] Create separate accounts for Admin, Principal, Bursary, teachers, librarian, parents and students.
- [ ] Test role permissions, especially staff bank details (bursary only), student records, result approval, fees, receipts and documents.
- [ ] Confirm primary-admin handover and recovery procedures.
- [ ] Review audit logs and retention policy.
- [ ] Confirm staff banking data encryption key is stable and backed up securely; do not rotate `SECRET_KEY` without a planned encrypted-data migration.

## Financial controls

- [ ] Verify every school account proposal and principal approval using real test accounts.
- [ ] Confirm parents/students see only approved school accounts.
- [ ] Test transfer receipt submission, rejection reason, bursary verification, receipt generation and duplicate prevention.
- [ ] Reconcile approved receipts against actual bank credits before marking payment complete.
- [ ] Test salary proposal, principal approval, bursary processing and payment history.
- [ ] Decide and implement bank statement reconciliation and/or a payment gateway before automating payment confirmation.

## Academic and operational workflows

- [ ] Test admission, parent linking, class/track assignment and student promotion.
- [ ] Test optional-subject rules and subject-teacher assignments.
- [ ] Test attendance, timetable, syllabi, exams, result submission, form-teacher review and final publication.
- [ ] Test report-card archive retrieval across previous sessions and terms.
- [ ] Test request submission, school response, resolution and requester visibility.
- [ ] Test document upload/download access from each role.

## Performance and recovery

- [ ] Load representative volumes (at least 5,000 students, large fee ledgers and concurrent users).
- [ ] Confirm database queries are indexed and paginated under realistic traffic.
- [ ] Run `backup.bat` or `python backup_school.py` and store the archive off-device.
- [ ] Restore a backup to a separate test environment and verify student, finance, academic and uploaded-file records.
- [ ] Test downtime monitoring, error logs and a support contact/process.

## Known items not supplied by this ZIP

Online payment gateway integration, automatic bank-statement reconciliation, a production hosting setup, antivirus scanning, multi-user edit conflict resolution and a completed browser end-to-end test suite still require separate implementation/configuration and validation. The project is not production-certified by the creation of this ZIP alone.
