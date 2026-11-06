import { base44 } from '@/api/base44Client';
import { items } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';

// Loads every record a learner's portal shows. RLS decides what the signed-in
// student, parent or guardian is actually allowed to read.
export async function loadLearnerData(student) {
  const workflowTimetableRequest = fetch('/api/workflows/timetable', { credentials: 'include' }).then(async (r) => { const d = await r.json().catch(() => []); if (!r.ok) throw new Error(d.error || 'Could not load session timetable.'); return d; });
  const promotionRequest = fetch('/api/workflows/promotions/mine', { credentials: 'include' }).then(async (r) => { const d = await r.json().catch(() => []); if (!r.ok) throw new Error(d.error || 'Could not load promotion history.'); return d; });
  const archiveRequest = fetch(`/api/report-cards/archive?student_id=${encodeURIComponent(student.id)}`, { credentials: 'include' }).then(async (r) => { const d = await r.json().catch(() => []); if (!r.ok) throw new Error(d.error || 'Could not load archived report cards.'); return d; });
  const [cfg, results, attendance, payments, fees, timetable, notices, resources, events, documents, requests, loans, books, profiles, archiveReports, workflowTimetable, promotionHistory] = await Promise.all([
    getSchoolSettings(),
    base44.entities.Result.filter({ student_id: student.id, status: 'published' }, { limit: 200 }),
    base44.entities.Attendance.filter({ student_id: student.id }, { limit: 400 }),
    base44.entities.Payment.filter({ student_id: student.id }, { limit: 200 }),
    base44.entities.FeeItem.list({ limit: 200 }),
    student.class_arm_id ? base44.entities.TimetableEntry.filter({ class_arm_id: student.class_arm_id }, { limit: 200 }) : Promise.resolve([]),
    base44.entities.Notice.list({ sort: '-created_date', limit: 30 }),
    base44.entities.ResourceItem.list({ sort: '-created_date', limit: 100 }),
    base44.entities.CalendarEvent.list({ sort: 'date', limit: 100 }),
    base44.entities.StudentDocument.filter({ student_id: student.id }, { limit: 100 }),
    base44.entities.PortalRequest.filter({ student_id: student.id }, { sort: '-created_date', limit: 50 }),
    student.user_email ? base44.entities.LibraryLoan.filter({ member_email: student.user_email }, { sort: '-created_date', limit: 50 }) : Promise.resolve([]),
    base44.entities.LibraryBook.list({ sort: 'title', limit: 300 }),
    base44.auth.me().then((u) => base44.entities.PortalProfile.filter({ email: u?.email })),
    archiveRequest,
    workflowTimetableRequest,
    promotionRequest,
  ]);

  const settings = cfg;
  return {
    settings,
    results: items(results).filter((r) => (!settings.session || r.session === settings.session) && (!settings.term || r.term === settings.term)),
    archiveReports: Array.isArray(archiveReports) ? archiveReports : [],
    promotionHistory: Array.isArray(promotionHistory) ? promotionHistory : [],
    attendance: items(attendance),
    payments: items(payments),
    fees: items(fees),
    timetable: items(timetable),
    workflowTimetable: Array.isArray(workflowTimetable) ? workflowTimetable : [],
    notices: items(notices),
    resources: items(resources),
    events: items(events),
    documents: items(documents),
    requests: items(requests),
    loans: items(loans),
    books: items(books),
    profile: items(profiles)[0] || {},
  };
}