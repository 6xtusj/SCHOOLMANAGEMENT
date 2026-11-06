import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { items, sortArms, today } from '@/lib/school';

export default function AdminAttendance() {
  const [arms, setArms] = useState([]);
  const [armId, setArmId] = useState('');
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        base44.entities.ClassArm.list({ sort: 'order', limit: 200 }),
        base44.entities.Student.list({ sort: 'full_name', limit: 2000 }),
      ]);
      const active = sortArms(items(a).filter((x) => x.active));
      setArms(active);
      setArmId(active[0]?.id || '');
      setStudents(items(s));
    })();
  }, []);

  useEffect(() => {
    if (!armId || !date) { setRecords([]); return; }
    base44.entities.Attendance.filter({ class_arm_id: armId, date }, { limit: 1000 }).then((response) => setRecords(items(response)));
  }, [armId, date]);

  const arm = arms.find((a) => a.id === armId) || null;
  const counts = records.reduce((summary, row) => ({ ...summary, [row.status]: (summary[row.status] || 0) + 1 }), {});

  return (
    <AppShell role="admin">
      <PageHeader title="Class attendance" description="View attendance registers submitted by each class Form Teacher." />

      <div className="surface mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Date</label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-auto" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class arm</label>
            <Select value={armId || 'none'} onValueChange={setArmId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Choose arm" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose arm</SelectItem>
                {arms.map((a) => <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {arm && <>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-success/40 text-success">Present {counts.present || 0}</Badge>
          <Badge variant="outline" className="border-warning/40 text-warning">Late {counts.late || 0}</Badge>
          <Badge variant="outline" className="border-destructive/40 text-destructive">Absent {counts.absent || 0}</Badge>
          <Badge variant="outline">Excused {counts.excused || 0}</Badge>
        </div>
        <div className="surface divide-y divide-border">
          {records.length ? records.map((record) => {
            const student = students.find((item) => item.id === record.student_id);
            return <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div><p className="font-medium">{record.student_name || student?.full_name || record.student_id}</p><p className="text-xs text-muted-foreground">{student?.admission_no || ''}</p></div>
              <Badge variant="outline" className="capitalize">{record.status}</Badge>
            </div>;
          }) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">No Form Teacher register has been submitted for {arm.display_name} on this date.</p>}
        </div>
      </>}
    </AppShell>
  );
}