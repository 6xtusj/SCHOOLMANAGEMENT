import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { items, today } from '@/lib/school';
import { base44 } from '@/api/base44Client';
import { Check, Loader2 } from 'lucide-react';

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

async function staffAttendance(date, body) {
  const response = await fetch(`/api/workflows/staff-attendance${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Staff attendance request failed.');
  return data;
}

export default function AdminStaffAttendance() {
  const [staff, setStaff] = useState([]);
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState([]);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [staffResponse, attendanceResponse] = await Promise.all([
      base44.entities.StaffProfile.list({ sort: 'full_name', limit: 1000 }),
      staffAttendance(date),
    ]);
    const rows = items(attendanceResponse);
    setStaff(items(staffResponse));
    setRecords(rows);
    setDraft(Object.fromEntries(rows.map((row) => [row.staff_id, row.status])));
  };

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [date]);

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      for (const member of staff) {
        const status = draft[member.id];
        if (!status) continue;
        await staffAttendance('', {
          staff_id: member.id,
          staff_name: member.full_name || member.name || member.email || member.id,
          attendance_date: date,
          status,
        });
      }
      await load();
      setMessage('Staff attendance saved.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const count = (status) => records.filter((row) => row.status === status).length;

  return <AppShell role="admin">
    <PageHeader title="Staff attendance" description="Record and review the staff register for a selected date." />
    {message && <p role="status" className="surface mb-4 p-3 text-sm">{message}</p>}
    <div className="surface mb-4 flex flex-wrap items-center gap-2 p-4">
      <label className="space-y-1 text-xs"><span className="text-muted-foreground">Attendance date</span><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      {STATUSES.map((status) => <Badge key={status} variant="outline">{status} {count(status)}</Badge>)}
    </div>
    <div className="surface divide-y divide-border">
      {staff.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div><p className="text-sm font-medium">{member.full_name || member.name || 'Staff member'}</p><p className="text-xs text-muted-foreground">{member.email || member.staff_id || ''}</p></div>
        <select aria-label={`Attendance for ${member.full_name || member.name || 'staff member'}`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={draft[member.id] || ''} onChange={(event) => setDraft((current) => ({ ...current, [member.id]: event.target.value }))}>
          <option value="">Not marked</option>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>)}
      {!staff.length && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No staff profiles are available.</p>}
    </div>
    <div className="mt-4 flex items-center gap-3"><Button disabled={busy || !staff.length} onClick={save}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save attendance</Button><p className="text-xs text-muted-foreground">Unmarked staff are not included in the register.</p></div>
  </AppShell>;
}