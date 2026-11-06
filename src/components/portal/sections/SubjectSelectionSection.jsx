import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { items } from '@/lib/school';

async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function SubjectSelectionSection({ student }) {
  const { user } = useAuth();
  const classKey = student?.class_arm_name || student?.class_arm_id || '';
  const [rules, setRules] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [selection, setSelection] = useState(null);
  const [requests, setRequests] = useState([]);
  const [chosen, setChosen] = useState([]);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestMode, setRequestMode] = useState(false);

  const load = async () => {
    if (!classKey) return;
    const [ruleData, sessions, subjectRows, own] = await Promise.all([
      api(`/api/academic/subject-rules/${encodeURIComponent(classKey)}`),
      api('/api/academic/sessions'),
      base44.entities.Subject.list({ limit: 500 }),
      api('/api/optional-subject-selections/mine'),
    ]);
    const activeSession = sessions.find((sessionRow) => (sessionRow.terms || []).some((term) => term.is_active));
    const term = activeSession?.terms?.find((item) => item.is_active);
    setActiveTerm(term ? { ...term, session_id: activeSession.id, session_name: activeSession.name } : null);
    setRules(ruleData.rules || []); setSubjects(items(subjectRows));
    const current = own.selection?.session_id === activeSession?.id ? own.selection : null;
    setSelection(current); setRequests(own.change_requests || []);
    setChosen(current?.subject_ids || []);
  };
  useEffect(() => { load().catch((e) => setMessage(e.message)); }, [classKey]);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const optional = rules.filter((r) => r.requirement === 'optional').map((r) => subjectMap.get(r.subject_id)).filter(Boolean);
  const compulsory = rules.filter((r) => r.requirement === 'compulsory').map((r) => subjectMap.get(r.subject_id)).filter(Boolean);
  const limits = rules.length ? null : null;
  const [ruleLimits, setRuleLimits] = useState(null);
  useEffect(() => { if (classKey) api(`/api/academic/subject-rules/${encodeURIComponent(classKey)}`).then((d) => setRuleLimits(d.limits)).catch(() => setRuleLimits(null)); }, [classKey]);
  const pending = requests.find((r) => r.status === 'pending');

  const submit = async () => {
    if (!activeTerm) { setMessage('The school has not activated an academic term yet.'); return; }
    setBusy(true); setMessage('');
    try {
      if (selection && requestMode) {
        await api(`/api/optional-subject-selections/${selection.id}/change-requests`, 'POST', { subject_ids: chosen, reason });
        setReason(''); setRequestMode(false); setMessage('Change request submitted. Your current selection remains active until approval.');
      } else {
        await api('/api/optional-subject-selections', 'POST', { student_id: user.id, class_key: classKey, session_id: activeTerm.session_id, term_id: activeTerm.id, subject_ids: chosen });
        setMessage('Your optional subjects are confirmed and locked for this academic session.');
      }
      await load();
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };

  if (user?.role !== 'student') return <p className="surface p-4 text-sm text-muted-foreground">Optional-subject selection is available to students. Parents can view their child’s confirmed subjects through the school office.</p>;
  return <div className="space-y-4">
    {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    <section className="surface space-y-3 p-4">
      <h2 className="font-semibold">Optional-subject selection</h2>
      <p className="text-sm text-muted-foreground">{classKey} · {activeTerm ? `${activeTerm.session_name} · ${activeTerm.name}` : 'No active term configured'}</p>
      {compulsory.length > 0 && <div><p className="text-xs font-semibold uppercase text-muted-foreground">Compulsory subjects</p><p className="mt-1 text-sm">{compulsory.map((s) => s.name).join(', ')}</p></div>}
      <div><p className="text-xs font-semibold uppercase text-muted-foreground">Choose optional subjects</p><p className="mt-1 text-xs text-muted-foreground">{ruleLimits?.mode === 'fixed' ? `Choose exactly ${ruleLimits.min_count}.` : `Choose between ${ruleLimits?.min_count ?? '—'} and ${ruleLimits?.max_count ?? '—'}.`}</p></div>
      {optional.length ? <div className="space-y-2">{optional.map((subject) => <label key={subject.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={chosen.includes(subject.id)} disabled={!!selection && !requestMode} onChange={(e) => setChosen((current) => e.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id))} />{subject.name}</label>)}</div> : <p className="text-sm text-muted-foreground">No optional subjects have been configured for this class arm.</p>}
      {selection && !requestMode && <div className="rounded-md bg-muted/40 p-3 text-sm"><p>Confirmed selection: {selection.subject_ids.map((id) => subjectMap.get(id)?.name || id).join(', ') || 'None'}</p><p className="mt-1 text-xs text-muted-foreground">This selection is locked for the session. Changes require Form Teacher or Admin approval.</p><Button className="mt-3" variant="outline" disabled={!!pending} onClick={() => { setChosen(selection.subject_ids); setRequestMode(true); }}>Request a change</Button></div>}
      {requestMode && <div className="space-y-2"><label className="block space-y-1 text-xs"><span>Reason for change</span><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why you need to change subjects" /></label><div className="flex gap-2"><Button variant="outline" onClick={() => { setRequestMode(false); setChosen(selection.subject_ids); }}>Cancel</Button><Button disabled={busy || !reason.trim()} onClick={submit}>Submit change request</Button></div></div>}
      {!selection && <Button disabled={busy || !activeTerm || !ruleLimits || chosen.length < Number(ruleLimits.min_count) || chosen.length > Number(ruleLimits.max_count)} onClick={submit}>Confirm selection</Button>}
    </section>
    {requests.length > 0 && <section className="surface space-y-2 p-4"><h3 className="font-semibold">Change request history</h3>{requests.map((r) => <div key={r.id} className="border-t py-2 text-sm"><p>{r.status} · {r.reason}</p><p className="text-xs text-muted-foreground">Requested {r.requested_at}</p>{r.decision_note && <p className="text-xs">Decision: {r.decision_note}</p>}</div>)}</section>}
  </div>;
}
