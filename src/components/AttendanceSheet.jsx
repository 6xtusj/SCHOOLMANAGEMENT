import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { today, items } from '@/lib/school';
import { Check, Loader2 } from 'lucide-react';

const OPTIONS = [
  { key: 'present', label: 'Present', tone: 'bg-success/15 text-success border-success/40' },
  { key: 'late', label: 'Late', tone: 'bg-warning/15 text-warning border-warning/40' },
  { key: 'absent', label: 'Absent', tone: 'bg-destructive/15 text-destructive border-destructive/40' },
  { key: 'excused', label: 'Excused', tone: 'bg-muted text-muted-foreground border-border' },
];

export default function AttendanceSheet({ arm, recordedBy, session, term }) {
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!arm) return;
    let active = true;
    setLoading(true);
    (async () => {
      const [studentRes, recRes] = await Promise.all([
        base44.entities.Student.filter({ class_arm_id: arm.id }, { limit: 300 }),
        base44.entities.Attendance.filter({ class_arm_id: arm.id, date }, { limit: 400 }),
      ]);
      if (!active) return;
      const list = items(studentRes).filter((s) => s.status === 'Active');
      const existing = items(recRes);
      setStudents(list);
      setRecords(existing);
      setDraft(Object.fromEntries(existing.map((r) => [r.student_id, r.status])));
      setSaved(false);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [arm, date]);

  const save = async () => {
    if (students.some((student) => !draft[student.id])) {
      window.alert('Mark every student before submitting this class register.');
      return;
    }
    setSaving(true);
    const pending = students.filter((s) => draft[s.id]);
    const newRows = [];
    const updates = [];
    pending.forEach((s) => {
      const status = draft[s.id];
      const existing = records.find((r) => r.student_id === s.id);
      if (existing) {
        if (existing.status !== status) updates.push({ id: existing.id, status });
      } else {
        newRows.push({
          student_id: s.id,
          student_name: s.full_name,
          student_email: s.user_email,
          guardian_email: s.guardian_email,
          class_arm_id: arm.id,
          class_arm_name: arm.display_name,
          date,
          status,
          session,
          term,
          recorded_by: recordedBy,
        });
      }
    });
    try {
      if (newRows.length) await base44.entities.Attendance.bulkCreate(newRows);
      if (updates.length) await base44.entities.Attendance.bulkUpdate(updates);
      const recRes = await base44.entities.Attendance.filter({ class_arm_id: arm.id, date }, { limit: 400 });
      setRecords(items(recRes));
      setSaved(true);
    } catch (error) {
      window.alert(error.message || 'Attendance could not be saved.');
    } finally { setSaving(false); }
  };

  const markAll = (status) => setDraft(Object.fromEntries(students.map((s) => [s.id, status])));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <Button variant="outline" size="sm" disabled={records.length > 0} onClick={() => markAll('present')}>Mark all present</Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {students.length} students · {Object.keys(draft).length} marked
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading class list…
        </div>
      ) : (
        <div className="surface divide-y divide-border">
          {students.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.full_name}</p>
                <p className="text-xs text-muted-foreground">{s.admission_no}</p>
              </div>
              <div className="flex gap-1.5">
                {OPTIONS.map((o) => {
                  const existing = records.find((record) => record.student_id === s.id);
                  const allowed = !existing || (existing.status === 'absent' && ['late', 'excused'].includes(o.key));
                  return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={!allowed}
                    onClick={() => setDraft((d) => ({ ...d, [s.id]: o.key }))}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs transition-colors',
                      draft[s.id] === o.key ? o.tone : 'border-border text-muted-foreground hover:bg-muted',
                      !allowed && 'cursor-not-allowed opacity-40'
                    )}
                  >
                    {o.label}
                  </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !students.length}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save attendance
        </Button>
        {saved && <span className="flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" /> Attendance saved</span>}
      </div>
    </div>
  );
}