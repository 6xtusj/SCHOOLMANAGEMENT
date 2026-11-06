import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

async function api(path, options = {}) {
  const r = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
const today = () => new Date().toISOString().slice(0, 10);
const initialTerm = { name: 'First Term', starts_on: '', ends_on: '', resumption_on: '', exam_starts_on: '', exam_ends_on: '', closing_on: '' };

export default function AcademicSessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState('');
  const [dates, setDates] = useState({ starts_on: '', ends_on: '' });
  const [selected, setSelected] = useState('');
  const [term, setTerm] = useState(initialTerm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = async () => { try { const rows = await api('/academic/sessions'); setSessions(rows); if (!selected && rows[0]) setSelected(rows[0].id); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); }, []);
  const createSession = async (e) => { e.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const row = await api('/academic/sessions', { method: 'POST', body: JSON.stringify({ name, ...dates }) }); setName(''); setSelected(row.id); setMessage('Academic session created.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const createTerm = async (e) => { e.preventDefault(); if (!selected) return; setBusy(true); setError(''); setMessage(''); try { await api(`/academic/sessions/${encodeURIComponent(selected)}/terms`, { method: 'POST', body: JSON.stringify(term) }); setTerm(initialTerm); setMessage('Term created.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const activate = async (id) => { setBusy(true); setError(''); setMessage(''); try { await api(`/academic/terms/${encodeURIComponent(id)}/activate`, { method: 'POST', body: '{}' }); setMessage('Active term updated. Historical term records were retained.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const advanceStage = async (id, status) => { setBusy(true); setError(''); setMessage(''); try { await api(`/academic/terms/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }); setMessage(`Term stage changed to ${status}.`); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const nextStage = { planned: 'open', open: 'exams', exams: 'closing', closing: 'finished' };
  const stageLabel = { planned: 'Planned', open: 'Open', exams: 'Examinations', closing: 'Closing', finished: 'Finished' };
  const actionLabel = { planned: 'Open term', open: 'Begin exams', exams: 'Begin closing', closing: 'Finish term' };
  return <div className="space-y-5">
    {(error || message) && <div role="status" className={`rounded-lg border p-3 text-sm ${error ? 'border-destructive/40 text-destructive' : 'border-primary/30 text-primary'}`}>{error || message}</div>}
    <form onSubmit={createSession} className="surface grid gap-3 p-5 sm:grid-cols-4 sm:items-end">
      <div className="space-y-1.5 sm:col-span-2"><Label>Academic session</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="2026/2027" required /></div>
      <div className="space-y-1.5"><Label>Starts</Label><Input type="date" value={dates.starts_on} onChange={e => setDates({ ...dates, starts_on: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Ends</Label><Input type="date" value={dates.ends_on} onChange={e => setDates({ ...dates, ends_on: e.target.value })} /></div>
      <div className="sm:col-span-4"><Button disabled={busy || !name.trim()}>Create session</Button></div>
    </form>
    <div className="surface space-y-4 p-5">
      <div><h3 className="font-heading text-base font-semibold">Add a term</h3><p className="text-sm text-muted-foreground">Set the dates for the selected academic session. Only one term can be active at a time.</p></div>
      <form onSubmit={createTerm} className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3"><Label>Session</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selected} onChange={e => setSelected(e.target.value)} required><option value="">Select session</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        {Object.entries({name:'Term name',starts_on:'Opening date',ends_on:'Closing date',resumption_on:'Resumption date',exam_starts_on:'Exam period starts',exam_ends_on:'Exam period ends',closing_on:'Term closing period'}).map(([key,label]) => <div className="space-y-1.5" key={key}><Label>{label}</Label><Input type={key==='name'?'text':'date'} value={term[key]} onChange={e => setTerm({ ...term, [key]: e.target.value })} placeholder={key==='name'?'First Term':''} required={key==='name'} /></div>)}
        <div className="sm:col-span-3"><Button disabled={busy || !selected || !term.name.trim()}>Add term</Button></div>
      </form>
    </div>
    <div className="space-y-3"><h3 className="font-heading text-base font-semibold">Academic calendar</h3>{sessions.map(s => <section key={s.id} className="surface space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold">{s.name}</h4><p className="text-xs text-muted-foreground">{s.starts_on || 'Start date not set'} — {s.ends_on || 'End date not set'}</p></div><Badge variant="secondary">{(s.terms || []).length} terms</Badge></div>{(s.terms || []).length ? <div className="grid gap-2 sm:grid-cols-3">{s.terms.map(t => <div key={t.id} className="rounded-lg border border-border p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-sm font-medium">{t.name}</p>{t.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</div><p className="mb-1 text-xs text-muted-foreground">{t.starts_on || '—'} to {t.ends_on || '—'}</p><p className="mb-3 text-xs font-medium text-muted-foreground">Stage: {stageLabel[t.status] || (t.is_active ? 'Open' : 'Planned')}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant={t.is_active ? 'secondary' : 'outline'} disabled={busy || !!t.is_active || t.status === 'finished'} onClick={() => activate(t.id)}>{t.is_active ? 'Current term' : 'Set active'}</Button>{nextStage[t.status || (t.is_active ? 'open' : 'planned')] && <Button size="sm" variant="outline" disabled={busy} onClick={() => advanceStage(t.id, nextStage[t.status || (t.is_active ? 'open' : 'planned')])}>{actionLabel[t.status || (t.is_active ? 'open' : 'planned')]}</Button>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No terms have been added.</p>}</section>)}</div>
  </div>;
}
