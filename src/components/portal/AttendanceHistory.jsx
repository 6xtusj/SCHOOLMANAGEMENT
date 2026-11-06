import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { CalendarCheck } from 'lucide-react';

const tone = {
  present: 'border-success/40 text-success',
  late: 'border-warning/40 text-warning',
  absent: 'border-destructive/40 text-destructive',
};

export default function AttendanceHistory({ records }) {
  const present = records.filter((r) => r.status === 'present').length;
  const late = records.filter((r) => r.status === 'late').length;
  const absent = records.filter((r) => r.status === 'absent').length;

  if (!records.length) {
    return <EmptyState icon={CalendarCheck} title="No attendance yet" description="Attendance appears here once the form teacher marks the register." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Days recorded" value={records.length} />
        <Stat label="Present" value={present} />
        <Stat label="Late" value={late} />
        <Stat label="Absent" value={absent} />
      </div>
      <div className="surface overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {[...records].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2 text-right">
                  <Badge variant="outline" className={`text-[10px] capitalize ${tone[r.status]}`}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-lg font-semibold">{value}</p>
    </div>
  );
}