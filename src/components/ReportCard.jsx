import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gradeOf } from '@/lib/school';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function ReportCard({ student, results, settings, attendance, position, classSize }) {
  const rows = [...(results || [])].sort((a, b) => (a.subject_name || '').localeCompare(b.subject_name || ''));
  const totalScore = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  const average = rows.length ? (totalScore / rows.length).toFixed(1) : '0.0';
  const present = (attendance || []).filter((a) => a.status === 'present').length;
  const late = (attendance || []).filter((a) => a.status === 'late').length;
  const absent = (attendance || []).filter((a) => a.status === 'absent').length;
  const formComment = rows.find((r) => r.form_comment)?.form_comment;
  const principalComment = rows.find((r) => r.principal_comment)?.principal_comment;
  const weights = settings || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Print report card
        </Button>
      </div>

      <div className="surface overflow-hidden" id="report-card">
        <div className="border-b border-border bg-primary/5 px-6 py-5 text-center">
          {weights.school_logo && <img src={weights.school_logo} alt={`${weights.school_name || 'School'} logo`} className="mx-auto mb-2 h-16 w-16 object-contain" />}
          <h2 className="font-heading text-lg font-semibold uppercase tracking-wide">
            {weights.school_name || 'School'}
          </h2>
          {weights.address && <p className="mt-0.5 text-xs text-muted-foreground">{weights.address}</p>}
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Terminal report sheet
          </p>
        </div>

        <div className="grid gap-x-6 gap-y-2 border-b border-border px-6 py-4 text-sm sm:grid-cols-2">
          <Row label="Student" value={student?.full_name} strong />
          <Row label="Admission no." value={student?.admission_no} />
          <Row label="Class" value={student?.class_arm_name || student?.level} />
          <Row label="Track" value={student?.track || '—'} />
          <Row label="Session" value={rows[0]?.session || weights.session} />
          <Row label="Term" value={rows[0]?.term || weights.term} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Subject</th>
                <th className="px-2 py-2 text-center font-medium">CA {weights.ca_weight ?? 40}</th>
                <th className="px-2 py-2 text-center font-medium">Assign {weights.assignment_weight ?? 10}</th>
                <th className="px-2 py-2 text-center font-medium">Test {weights.test_weight ?? 10}</th>
                <th className="px-2 py-2 text-center font-medium">Exam {weights.exam_weight ?? 40}</th>
                <th className="px-2 py-2 text-center font-medium">Total</th>
                <th className="px-2 py-2 text-center font-medium">Grade</th>
                <th className="px-4 py-2 text-left font-medium">Remark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const g = gradeOf(r.total);
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium">{r.subject_name}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{Number(r.ca) || 0}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{Number(r.assignment_score) || 0}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{Number(r.test) || 0}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{Number(r.exam) || 0}</td>
                    <td className="px-2 py-2 text-center font-semibold tabular-nums">{Number(r.total) || 0}</td>
                    <td className="px-2 py-2 text-center font-medium text-primary">{g.grade}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{g.remark}</td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No published results for this term yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 border-t border-border px-6 py-4 text-sm sm:grid-cols-4">
          <Metric label="Subjects" value={rows.length} />
          <Metric label="Total score" value={totalScore} />
          <Metric label="Average" value={average} />
          <Metric label="Position" value={position ? `${position}${classSize ? ` of ${classSize}` : ''}` : '—'} />
        </div>

        <div className="grid gap-3 border-t border-border px-6 py-4 text-sm sm:grid-cols-3">
          <Metric label="Days present" value={present} />
          <Metric label="Days late" value={late} />
          <Metric label="Days absent" value={absent} />
        </div>

        <div className="space-y-3 border-t border-border px-6 py-4 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Form teacher's comment</p>
            <p className="mt-1">{formComment || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Principal's comment</p>
            <p className="mt-1">{principalComment || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold' : ''}>{value || '—'}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-sm font-semibold">{value}</p>
    </div>
  );
}