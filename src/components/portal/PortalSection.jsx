import StudentWorkspace from '@/components/portal/StudentWorkspace';
import ResultsSection from '@/components/portal/sections/ResultsSection';
import AttendanceSection from '@/components/portal/sections/AttendanceSection';
import TimetableSection from '@/components/portal/sections/TimetableSection';
import CalendarSection from '@/components/portal/sections/CalendarSection';
import NoticesSection from '@/components/portal/sections/NoticesSection';
import FinanceSection from '@/components/portal/sections/FinanceSection';
import DocumentsSection from '@/components/portal/sections/DocumentsSection';
import RequestsSection from '@/components/portal/sections/RequestsSection';
import LibrarySection from '@/components/portal/sections/LibrarySection';
import SyllabiSection from '@/components/portal/sections/SyllabiSection';
import NotificationsSection from '@/components/portal/sections/NotificationsSection';
import ProfileSection from '@/components/portal/sections/ProfileSection';
import SubjectSelectionSection from '@/components/portal/sections/SubjectSelectionSection';
import StudentSubjectTeachers from '@/components/portal/sections/StudentSubjectTeachers';

export const SECTIONS = {
  overview: 'Overview',
  results: 'Results',
  subjects: 'Optional-subject selection',
  attendance: 'Attendance',
  timetable: 'Timetable',
  calendar: 'School calendar',
  notices: 'Notices',
  finance: 'Invoices & payments',
  documents: 'Documents',
  requests: 'Requests',
  library: 'Library',
  syllabi: 'Syllabi & past questions',
  notifications: 'Notification settings',
  profile: 'Profile & settings',
};

export default function PortalSection({ section, ctx }) {
  const { student, settings, results, archiveReports, workflowTimetable, promotionHistory, attendance, payments, fees, timetable, notices, resources, events, documents, requests, loans, books, profile, user, reload, reloadProfile } = ctx;

  switch (section) {
    case 'subjects':
      return <div className="space-y-5"><StudentSubjectTeachers student={student} /><SubjectSelectionSection student={student} /></div>;
    case 'results':
      return <ResultsSection student={student} settings={settings} results={results} archiveReports={archiveReports} attendance={attendance} />;
    case 'attendance':
      return <AttendanceSection attendance={attendance} />;
    case 'timetable':
      return <TimetableSection student={student} timetable={timetable} workflowTimetable={workflowTimetable} />;
    case 'calendar':
      return <CalendarSection events={events} />;
    case 'notices':
      return <NoticesSection notices={notices} audience={user?.role === 'parent' ? 'parents' : 'students'} />;
    case 'finance':
      return <FinanceSection student={student} settings={settings} fees={fees} payments={payments} />;
    case 'documents':
      return <DocumentsSection student={student} documents={documents} onChanged={reload} />;
    case 'requests':
      return <RequestsSection student={student} requests={requests} raisedBy={user?.email} onCreated={reload} />;
    case 'library':
      return <LibrarySection books={books} loans={loans} />;
    case 'syllabi':
      return <SyllabiSection resources={resources} level={student?.level} />;
    case 'notifications':
      return <NotificationsSection />;
    case 'profile':
      return <ProfileSection student={ctx.isLearner ? student : null} profile={profile} user={user} onSaved={reload} />;
    default:
      return (
        <StudentWorkspace
          student={student}
          settings={settings}
          results={results}
          attendance={attendance}
          payments={payments}
          fees={fees}
          timetable={timetable}
          notices={notices}
          resources={resources}
          events={events}
        />
      );
  }
}