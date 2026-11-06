import { Link, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, CalendarDays,
  ClipboardCheck, Wallet, Library, Settings, NotebookPen, UserCircle2,
  BarChart3, FileText, MessageSquare, Bell, Landmark, Coins, BookMarked
} from 'lucide-react';
import { cn } from '@/lib/utils';

const learnerGroups = (base, overviewLabel, overviewHint, includeSubjectSelection = false) => [
  { group: 'Overview', items: [{ to: base, label: overviewLabel, icon: LayoutDashboard, end: true }] },
  { group: 'Academics', items: [
    ...(includeSubjectSelection ? [{ to: `${base}/subjects`, label: 'Subject selection', icon: BookOpen }] : []),
    { to: `${base}/results`, label: 'Results', icon: ClipboardCheck },
    { to: `${base}/attendance`, label: 'Attendance', icon: BarChart3 },
    { to: `${base}/timetable`, label: 'Timetable', icon: CalendarDays },
    { to: `${base}/calendar`, label: 'School calendar', icon: CalendarDays },
    { to: `${base}/syllabi`, label: 'Syllabi & past questions', icon: BookOpen },
  ] },
  { group: 'Finance', items: [
    { to: `${base}/finance`, label: 'Invoices & payments', icon: Wallet },
  ] },
  { group: 'School life', items: [
    { to: `${base}/notices`, label: 'Notices', icon: MessageSquare },
    { to: `${base}/library`, label: 'Library', icon: Library },
    { to: `${base}/documents`, label: 'Documents', icon: FileText },
    { to: `${base}/requests`, label: 'Requests', icon: NotebookPen },
  ] },
  { group: 'Account', items: [
    { to: `${base}/notifications`, label: 'Notifications', icon: Bell },
    { to: `${base}/profile`, label: 'Profile & settings', icon: UserCircle2 },
  ] },
];

export const NAV = {
  admin: [
    { group: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    { group: 'People', items: [
      { to: '/admin/students', label: 'Students', icon: GraduationCap },
      { to: '/admin/staff', label: 'Staff & Assignments', icon: Users },
      { to: '/admin/accounts', label: 'Portal accounts', icon: UserCircle2 },
      { to: '/admin/admissions', label: 'Admission applications', icon: GraduationCap },
      { to: '/admin/requests', label: 'Student & parent requests', icon: NotebookPen },
      { to: '/account/profile', label: 'Profile & settings', icon: UserCircle2 },
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
    ] },
    { group: 'Academics', items: [
      { to: '/admin/academics', label: 'Classes & Subjects', icon: BookOpen },
      { to: '/admin/timetable', label: 'Timetable', icon: CalendarDays },
      { to: '/admin/results', label: 'Results & Approvals', icon: ClipboardCheck },
      { to: '/admin/attendance', label: 'Attendance', icon: BarChart3 },
      { to: '/admin/staff-attendance', label: 'Staff attendance', icon: ClipboardCheck },
    ] },
    { group: 'Operations', items: [
      { to: '/admin/finance', label: 'Fees & Finance', icon: Wallet },
      { to: '/admin/resources', label: 'School Resources', icon: Library },
      { to: '/admin/settings', label: 'School Settings', icon: Settings },
    ] },
  ],
  principal: [
    { group: 'School oversight', items: [
      { to: '/principal', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/principal/students', label: 'Students & classes', icon: GraduationCap },
      { to: '/principal/staff', label: 'Staff & salaries', icon: Users },
      { to: '/principal/timetable', label: 'Class timetables', icon: CalendarDays },
      { to: '/principal/parents', label: 'Parents', icon: UserCircle2 },
      { to: '/principal/finance', label: 'Fees & finance', icon: Wallet },
      { to: '/principal/sessions', label: 'Sessions & terms', icon: CalendarDays },
      { to: '/principal/notices', label: 'School notices', icon: MessageSquare },
      { to: '/principal/requests', label: 'Student & parent requests', icon: NotebookPen },
      { to: '/principal/approvals', label: 'Approvals & activity', icon: ClipboardCheck },
      { to: '/principal/receipt-approvals', label: 'Fee receipt approvals', icon: ClipboardCheck },
      { to: '/account/profile', label: 'Profile & settings', icon: UserCircle2 },
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
    ] },
  ],
  teacher: [
    { group: 'Workspace', items: [
      { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/teacher/results', label: 'Subject Results', icon: NotebookPen },
      { to: '/teacher/attendance', label: 'Attendance', icon: ClipboardCheck },
      { to: '/teacher/timetable', label: 'My Timetable', icon: CalendarDays },
      { to: '/teacher/students', label: 'Students I manage', icon: Users },
      { to: '/teacher/syllabi', label: 'Syllabi', icon: BookOpen },
      { to: '/teacher/exams', label: 'Exam schedules', icon: CalendarDays },
      { to: '/teacher/calendar', label: 'School calendar', icon: CalendarDays },
      { to: '/teacher/notices', label: 'School notices', icon: MessageSquare },
      { to: '/teacher/profile', label: 'Profile & settings', icon: UserCircle2 },
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
    ] },
  ],
  librarian: [
    { group: 'Library', items: [
      { to: '/library', label: 'Library desk', icon: LayoutDashboard, end: true },
      { to: '/library/catalogue', label: 'Catalogue', icon: BookMarked },
      { to: '/library/loans', label: 'Issues & returns', icon: BookOpen },
      { to: '/account/profile', label: 'Profile & settings', icon: UserCircle2 },
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
    ] },
  ],
  bursar: [
    { group: 'Bursary', items: [
      { to: '/bursary', label: 'Bursary desk', icon: Landmark, end: true },
      { to: '/bursary/payments', label: 'Student payments', icon: Wallet },
      { to: '/bursary/status', label: 'Class fee status', icon: ClipboardCheck },
      { to: '/bursary/fees', label: 'Fee structure', icon: Coins },
      { to: '/bursary/payroll', label: 'Staff payments', icon: Users },
      { to: '/bursary/approvals', label: 'Approval requests', icon: ClipboardCheck },
      { to: '/bursary/school-accounts', label: 'School bank accounts', icon: Landmark },
      { to: '/bursary/staff-bank-details', label: 'Staff bank details', icon: Wallet },
      { to: '/admin/resources', label: 'Student documents', icon: FileText },
      { to: '/account/profile', label: 'Profile & settings', icon: UserCircle2 },
      { to: '/account/notifications', label: 'Notifications', icon: Bell },
    ] },
  ],
  student: learnerGroups('/student', 'My portal', undefined, true),
  parent: learnerGroups('/parent', 'My children'),
};

export default function AppSidebar({ role, schoolName, schoolLogo, onNavigate }) {
  const groups = NAV[role] || NAV.student;
  const initials = (schoolName || 'School').slice(0, 2).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/" onClick={onNavigate} aria-label={`${schoolName || 'School'} homepage`} className="flex items-center gap-3 px-5 py-5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {schoolLogo ? <img src={schoolLogo} alt={`${schoolName || 'School'} logo`} className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-1" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground font-heading">{initials}</div>}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground font-heading">{schoolName || 'School'}</p>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{role === 'principal' ? 'Principal portal' : `${role} portal`}</p>
        </div>
      </Link>

      <nav className="subtle-scroll flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((group) => (
          <div key={group.group}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {group.group}
            </p>
            <div className="space-y-1">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}