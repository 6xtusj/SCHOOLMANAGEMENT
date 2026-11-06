import ReportCard from '@/components/ReportCard';
import EmptyState from '@/components/EmptyState';
import { ClipboardCheck } from 'lucide-react';

export default function ResultsSection({ student, settings, results, archiveReports = [], attendance }) {
  const rows = results || [];
  const position = rows.find((r) => r.position)?.position;
  const classSize = rows.find((r) => r.class_size)?.class_size;
  const average = rows.length ? (rows.reduce((s, r) => s + (Number(r.total) || 0), 0) / rows.length).toFixed(1) : '—';

  if (!rows.length && !archiveReports.length) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Results not published yet"
        description="The report card appears here once the school publishes this term's results."
      />
    );
  }

  return (
    <div className="space-y-4">
      {archiveReports.length > 0 && <section className="surface space-y-3 p-4"><h3 className="font-semibold">Previous report cards</h3>{archiveReports.map((report) => <details key={report.id} className="rounded-md border p-3"><summary className="cursor-pointer text-sm">{report.session_name} · {report.term_name} · {report.class_arm_name}</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-1 text-left">Subject</th><th className="p-1 text-right">Total</th><th className="p-1 text-left">Grade</th></tr></thead><tbody>{(report.results || []).map((result, index) => <tr key={`${report.id}-${index}`}><td className="p-1">{result.subject_name || result.subject_id}</td><td className="p-1 text-right">{result.total}</td><td className="p-1">{result.grade || '—'}</td></tr>)}</tbody></table></div></details>)}</section>}
      {!rows.length && <EmptyState icon={ClipboardCheck} title="No results for the current term" description="Your published reports from previous terms are available above." />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Mini label="Subjects" value={rows.length} />
        <Mini label="Average" value={average} />
        <Mini label="Position" value={position ? `${position} of ${classSize || '—'}` : '—'} />
      </div>
      <ReportCard
        student={student}
        results={rows}
        settings={settings}
        attendance={attendance || []}
        position={position}
        classSize={classSize}
      />
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