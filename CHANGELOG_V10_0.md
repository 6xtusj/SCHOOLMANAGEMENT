# V10.0 — Existing-feature audit and integrity corrections

- Audited the V9.5.0 project before adding features; retained the existing results, report-card, academic term, class/subject, admission, parent-linking, attendance, timetable, document-permission and security workflows.
- Expanded approved and rejected payment notifications to every recorded guardian contact, with in-app alerts for the student and linked guardians.
- Email is sent to guardian contacts when recorded; the student's email is used only when no guardian contact exists.
- Strengthened promotion API validation: valid session dates, next-level-only promotion, active destination class, SS1-to-SS2 track requirement and strict SS2-to-SS3 track preservation.
- Replaced stale tests that expected Principal approval of student transfer receipts with Bursary-only receipt approval tests. Principal approval for proposed school bank-account changes remains a separate workflow.
- Added regression coverage for multiple guardians, student-email fallback and promotion restrictions.
- Updated finance documentation and explicitly documented that genuine offline-first synchronisation is not yet implemented.
