import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import TimetableGrid from '@/components/portal/TimeTableGrid';
import usePortalUser from '@/lib/usePortalUser';
import { items } from '@/lib/school';
import { Loader2 } from 'lucide-react';

export default function TeacherTimetable() {
  const { user } = usePortalUser();
  const [lessons, setLessons] = useState([]);
  const [workflowLessons, setWorkflowLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const [res, workflowResponse] = await Promise.all([
        base44.entities.TimetableEntry.filter({ teacher_email: user.email }, { limit: 200 }),
        fetch('/api/workflows/timetable', { credentials: 'include' }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load term timetables.'); return d; }),
      ]);
      setLessons(items(res));
      setWorkflowLessons(workflowResponse);
      setLoading(false);
    })();
  }, [user?.email]);

  return (
    <AppShell role="teacher">
      <PageHeader title="My timetable" description="Every lesson assigned to you this week." />
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading timetable…</div>
      ) : (
        <div className="space-y-4"><TimetableGrid entries={lessons} />{workflowLessons.length > 0 && <section className="surface space-y-2 p-4"><h2 className="font-semibold">Session-based timetable entries</h2>{workflowLessons.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][entry.weekday]} · {entry.period} · {entry.subject_id}</span><span className="text-muted-foreground">{entry.class_key}{entry.room ? ` · ${entry.room}` : ''} · {entry.session_id} / {entry.term_id}</span></div>)}</section>}</div>
      )}
    </AppShell>
  );
}