import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import AttendanceSheet from '@/components/AttendanceSheet';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import usePortalUser from '@/lib/usePortalUser';
import { items } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';
import { ClipboardCheck } from 'lucide-react';

export default function TeacherAttendance() {
  const { user } = usePortalUser();
  const [arms, setArms] = useState([]);
  const [armId, setArmId] = useState('');
  const [settings, setSettings] = useState({});
  const [changeRequests, setChangeRequests] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const [asg, cfg, requestResponse] = await Promise.all([
        base44.entities.Assignment.filter({ teacher_email: user.email }, { limit: 200 }),
        getSchoolSettings(),
        fetch('/api/optional-subject-change-requests', { credentials: 'include' }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load subject-change requests.'); return d; }),
      ]);
      const list = items(asg).filter((a) => a.class_arm_id && a.type === 'form');
      const unique = [...new Map(list.map((a) => [a.class_arm_id, { id: a.class_arm_id, name: a.class_arm_name, form: true }])).values()];
      setArms(unique);
      setArmId(unique[0]?.id || '');
      setSettings(cfg);
      setChangeRequests(requestResponse);
    })();
  }, [user?.email]);

  const decideSubjectChange = async (id, decision) => {
    setMessage('');
    const response = await fetch(`/api/optional-subject-change-requests/${id}/decision`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(data.error || 'Could not save the subject-change decision.'); return; }
    setChangeRequests((rows) => rows.filter((row) => row.id !== id));
    setMessage(`Subject-change request ${decision}.`);
  };

  const arm = arms.find((a) => a.id === armId);

  return (
    <AppShell role="teacher">
      <PageHeader title="Attendance" description="Mark attendance only for your assigned Form Teacher class arms." />

      {message && <p role="status" className="surface mb-4 p-3 text-sm">{message}</p>}
      {changeRequests.length > 0 && <section className="surface mb-5 space-y-3 p-4"><h2 className="font-semibold">Optional-subject change requests</h2><p className="text-xs text-muted-foreground">Review requests from students in your assigned Form Teacher class arms.</p>{changeRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"><div><p className="font-medium">{request.class_key} · Student {request.student_id}</p><p className="text-xs text-muted-foreground">Reason: {request.reason}</p><p className="text-xs text-muted-foreground">Requested subjects: {(request.requested_subject_ids || []).join(', ')}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => decideSubjectChange(request.id, 'approved')}>Approve</Button><Button size="sm" variant="outline" onClick={() => decideSubjectChange(request.id, 'rejected')}>Reject</Button></div></div>)}</section>}

      {!arms.length ? (
        <EmptyState icon={ClipboardCheck} title="No classes assigned" description="Attendance opens once the administrator assigns you as Form Teacher to a class arm." />
      ) : (
        <>
          <div className="surface mb-5 p-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class arm</label>
              <Select value={armId} onValueChange={setArmId}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {arms.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}{a.form ? ' (form class)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {arm && (
            <AttendanceSheet
              arm={{ id: arm.id, display_name: arm.name }}
              recordedBy={user?.full_name || user?.email}
              session={settings.session}
              term={settings.term}
            />
          )}
        </>
      )}
    </AppShell>
  );
}