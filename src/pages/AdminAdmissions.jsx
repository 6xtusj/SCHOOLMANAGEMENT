import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Admission request failed.');
  return data;
}

export default function AdminAdmissions() {
  const [applications, setApplications] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState({});
  const load = useCallback(async () => {
    setError('');
    try { setApplications(await request('/api/admissions')); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (application, action) => {
    setBusy(application.id); setMessage(''); setError('');
    try {
      const payload = action === 'schedule_exam'
        ? { action, exam_date: schedule[`${application.id}:date`], exam_time: schedule[`${application.id}:time`], exam_venue: schedule[`${application.id}:venue`], admin_note: schedule[`${application.id}:note`] || '' }
        : { action, admin_note: schedule[`${application.id}:note`] || '' };
      const result = await request(`/api/admissions/${application.id}/decision`, { method: 'POST', body: JSON.stringify(payload) });
      setMessage(action === 'passed'
        ? `${application.application.student_name} admitted and placed in ${result.class_arm?.name}.`
        : action === 'schedule_exam'
          ? `Examination schedule saved. ${result.email_sent ? 'A schedule email was sent to the guardian.' : `No email was sent: ${result.email_error || 'School email is not configured.'}`}`
          : `Application ${result.status || 'updated'}.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };
  const set = (id, field, value) => setSchedule((current) => ({ ...current, [`${id}:${field}`]: value }));

  return <AppShell role="admin"><PageHeader title="Admission applications" description="Review entrance-exam requests, schedule examinations, and admit successful applicants into the least-filled matching class arm." />
    <div className="mb-4 flex justify-end"><Button variant="outline" onClick={load}>Refresh applications</Button></div>
    {message && <p role="status" className="mb-3 text-sm text-success">{message}</p>}
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    <div className="space-y-4">{applications.map((row) => {
      const applicant = row.application;
      const closed = ['admitted', 'not_passed'].includes(row.status);
      return <section key={row.id} className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-lg font-semibold">{applicant.student_name}</h2><p className="text-xs text-muted-foreground">{row.reference} · Submitted {new Date(row.created_at).toLocaleString()}</p></div><Badge variant={row.status === 'admitted' ? 'default' : row.status === 'not_passed' ? 'destructive' : 'secondary'}>{row.status.replaceAll('_', ' ')}</Badge></div>
        <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p><strong>Applying for:</strong> {applicant.requested_level}{applicant.requested_track ? ` · ${applicant.requested_track}` : ''}</p><p><strong>DOB / gender:</strong> {applicant.date_of_birth} · {applicant.gender}</p>
          <p><strong>Guardian:</strong> {applicant.guardian_name}</p><p><strong>Phone:</strong> {applicant.guardian_phone}</p><p><strong>Email:</strong> {applicant.guardian_email}</p><p><strong>Previous school:</strong> {applicant.previous_school || 'Not provided'}</p><p className="sm:col-span-2"><strong>Address:</strong> {applicant.address}</p>
          {row.student_id && <p><strong>Enrolled student record:</strong> {row.student_id}</p>}
          {row.exam_date && <p className="sm:col-span-2"><strong>Exam:</strong> {row.exam_date} · {row.exam_time} · {row.exam_venue}</p>}
        </div>
        {!closed && <><div className="grid gap-2 sm:grid-cols-3"><Input type="date" aria-label="Exam date" value={schedule[`${row.id}:date`] || row.exam_date || ''} onChange={(e) => set(row.id, 'date', e.target.value)} /><Input type="time" aria-label="Exam time" value={schedule[`${row.id}:time`] || row.exam_time || ''} onChange={(e) => set(row.id, 'time', e.target.value)} /><Input aria-label="Exam venue" placeholder="Exam venue" value={schedule[`${row.id}:venue`] || row.exam_venue || ''} onChange={(e) => set(row.id, 'venue', e.target.value)} /></div><Textarea aria-label="Admin note" placeholder="Admin note (optional)" value={schedule[`${row.id}:note`] || row.admin_note || ''} onChange={(e) => set(row.id, 'note', e.target.value)} /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!busy} onClick={() => decide(row, 'schedule_exam')}>{busy === row.id ? 'Saving…' : row.exam_date ? 'Update exam schedule' : 'Schedule entrance exam'}</Button>{row.status === 'exam_scheduled' && <><Button disabled={!!busy} onClick={() => decide(row, 'passed')}>Exam passed — admit student</Button><Button variant="destructive" disabled={!!busy} onClick={() => decide(row, 'not_passed')}>Exam not passed</Button></>}</div></>}
      </section>;
    })}{!applications.length && !error && <p className="surface p-8 text-center text-sm text-muted-foreground">No admission applications have been received.</p>}</div>
  </AppShell>;
}
