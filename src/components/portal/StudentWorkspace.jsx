import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import ReportCard from '@/components/ReportCard';
import AttendanceHistory from '@/components/portal/AttendanceHistory';
import FeeStatement from '@/components/portal/FeeStatement';
import FeeReceiptSubmission from '@/components/portal/FeeReceiptSubmission';
import TimetableGrid from '@/components/portal/TimeTableGrid';
import ResourceList from '@/components/portal/ResourceList';
import NoticeList from '@/components/portal/NoticeList';
import EmptyState from '@/components/EmptyState';
import { CalendarDays, Wallet, BookOpen, ClipboardCheck, Megaphone } from 'lucide-react';

export default function StudentWorkspace({
  student, settings, results, attendance, payments, fees, timetable, notices, resources, events,
}) {
  const publishedResults = results;
  const rows = useMemo(() => publishedResults, [publishedResults]);
  const average = rows.length ? (rows.reduce((s, r) => s + (Number(r.total) || 0), 0) / rows.length).toFixed(1) : '—';
  const position = rows.find((r) => r.position)?.position;
  const classSize = rows.find((r) => r.class_size)?.class_size;
  const attendanceRate = attendance.length
    ? Math.round((attendance.filter((a) => a.status !== 'absent').length / attendance.length) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Class" value={student.class_arm_name || student.level} hint={student.track || 'No track'} />
        <Mini label="Subjects this term" value={rows.length || '—'} hint="Published results only" />
        <Mini label="Average score" value={average} hint={position ? `${position} of ${classSize || '—'} in class` : 'Position after publishing'} />
        <Mini label="Attendance" value={attendanceRate === null ? '—' : `${attendanceRate}%`} hint={`${attendance.length} days recorded`} />
      </div>

      <section>
        <SectionTitle icon={ClipboardCheck} title="Report card" subtitle={`${settings.session || ''} ${settings.term || ''}`} />
        {rows.length ? (
          <ReportCard
            student={student}
            results={rows}
            settings={settings}
            attendance={attendance}
            position={position}
            classSize={classSize}
          />
        ) : (
          <EmptyState icon={ClipboardCheck} title="Results not published yet" description="Your report card appears here once the school publishes this term's results." />
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle icon={CalendarDays} title="Timetable" subtitle={student.class_arm_name} />
          <TimetableGrid entries={timetable} />
        </div>
        <div>
          <SectionTitle icon={BookOpen} title="Attendance" subtitle="This session" />
          <AttendanceHistory records={attendance} />
        </div>
      </section>

      <section>
        <SectionTitle icon={Wallet} title="Fees" subtitle={`${settings.session || ''} ${settings.term || ''}`} />
        <FeeStatement student={student} fees={fees} payments={payments} session={settings.session} term={settings.term} />
        <div className="mt-4"><FeeReceiptSubmission student={student} settings={settings} fees={fees} /></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle icon={BookOpen} title="Books & materials" subtitle="Uploaded by the school" />
          <ResourceList resources={resources} level={student.level} classArmId={student.class_arm_id} track={student.track} />
        </div>
        <div>
          <SectionTitle icon={CalendarDays} title="School calendar" subtitle="Exams, holidays and events" />
          <div className="space-y-2">
            {events.length ? events.map((e) => (
              <div key={e.id} className="surface flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.date}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] capitalize">{e.type}</Badge>
              </div>
            )) : <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle icon={Megaphone} title="Notices" subtitle="From the school office" />
        <NoticeList notices={notices} audience="students" />
      </section>
    </div>
  );
}

function Mini({ label, value, hint }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-lg font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="font-heading text-sm font-semibold">{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">· {subtitle}</span>}
    </div>
  );
}