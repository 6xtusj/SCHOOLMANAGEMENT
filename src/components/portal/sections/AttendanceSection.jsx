import AttendanceHistory from '@/components/portal/AttendanceHistory';
import EmptyState from '@/components/EmptyState';
import { BarChart3 } from 'lucide-react';

export default function AttendanceSection({ attendance }) {
  const records = attendance || [];
  const present = records.filter((r) => r.status === 'present').length;
  const late = records.filter((r) => r.status === 'late').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const rate = records.length ? Math.round(((present + late) / records.length) * 100) : null;

  if (!records.length) {
    return <EmptyState icon={BarChart3} title="No attendance recorded yet" description="Daily attendance appears here once your teachers begin marking the register." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Mini label="Attendance rate" value={rate === null ? '—' : `${rate}%`} />
        <Mini label="Present" value={present} />
        <Mini label="Late" value={late} />
        <Mini label="Absent" value={absent} />
      </div>
      <AttendanceHistory records={records} />
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-lg font-semibold">{value}</p>
    </div>
  );
}