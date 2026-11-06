import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

async function api(path, options = {}) { const r = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d; }
export default function SubjectRulesPanel({ arms, subjects }) {
  const [classKey, setClassKey] = useState(''); const [rules, setRules] = useState({}); const [mode, setMode] = useState('range'); const [min, setMin] = useState('0'); const [max, setMax] = useState('0'); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const scopes = [...new Map(arms.filter((arm) => arm.active !== false).map((arm) => {
    const level = String(arm.level || '').replace(/\s+/g, ' ').trim();
    const track = ['SS 2', 'SS 3'].includes(level) ? String(arm.track || '').replace(/s$/i, '') : '';
    const key = `${level}${track ? ` ${track}` : ''}`;
    return [key, { key, level, track }];
  })).values()];
  const selectedScope = scopes.find((scope) => scope.key === classKey);
  const available = subjects.filter((subject) => subject.active !== false
    && (!selectedScope || !(subject.levels || []).length || subject.levels.includes(selectedScope.level))
    && (!selectedScope?.track || !(subject.tracks || []).length || subject.tracks.some((track) => track.replace(/s$/i, '') === selectedScope.track)));
  useEffect(() => { if (scopes.length && !classKey) setClassKey(scopes[0].key); }, [scopes, classKey]);
  useEffect(() => { if (!classKey) return; let alive = true; api(`/academic/subject-rules/${encodeURIComponent(classKey)}`).then(data => { if (!alive) return; const next = {}; (data.rules || []).forEach(r => { next[r.subject_id] = r.requirement; }); setRules(next); setMode(data.limits?.mode || 'range'); setMin(String(data.limits?.min_count ?? 0)); setMax(String(data.limits?.max_count ?? 0)); }).catch(e => setError(e.message)); return () => { alive = false; }; }, [classKey]);
  const save = async () => { setBusy(true); setError(''); setMessage(''); try { const payload = { class_key: classKey, rules: available.map(s => ({ subject_id: s.id, requirement: rules[s.id] || 'unavailable' })), limits: { mode, min: Number(min), max: Number(max) } }; await api('/academic/subject-rules', { method: 'POST', body: JSON.stringify(payload) }); setMessage(`Subject rules saved for ${classKey}.`); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="space-y-4">
    {(error || message) && <div role="status" className={`rounded-lg border p-3 text-sm ${error ? 'border-destructive/40 text-destructive' : 'border-primary/30 text-primary'}`}>{error || message}</div>}
    <div className="surface grid gap-3 p-5 sm:grid-cols-3 sm:items-end"><div className="space-y-1.5 sm:col-span-2"><Label>Level or class track</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={classKey} onChange={e => setClassKey(e.target.value)}>{scopes.map((scope) => <option key={scope.key} value={scope.key}>{scope.key}{scope.track ? ' · all arms in this track' : ' · all arms'}</option>)}</select></div><p className="text-xs text-muted-foreground">JSS and SS1 rules apply to every arm. SS2 and SS3 rules apply to every arm within the selected track.</p></div>
    <div className="surface space-y-4 p-5"><div><h3 className="font-heading text-base font-semibold">Subject availability and requirements</h3><p className="text-sm text-muted-foreground">Choose whether each available subject is compulsory, optional or unavailable for this class.</p></div>
      {available.length ? <div className="divide-y divide-border">{available.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.code || 'No subject code'}</p></div><select aria-label={`${s.name} requirement`} className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-sm" value={rules[s.id] || 'unavailable'} onChange={e => setRules({ ...rules, [s.id]: e.target.value })}><option value="compulsory">Compulsory</option><option value="optional">Optional</option><option value="unavailable">Unavailable</option></select></div>)}</div> : <p className="text-sm text-muted-foreground">No active subjects are currently configured for this class.</p>}
      <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3 sm:items-end"><div className="space-y-1.5"><Label>Selection rule</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={mode} onChange={e => { setMode(e.target.value); if (e.target.value === 'fixed') setMax(min); }}><option value="range">Minimum and maximum</option><option value="fixed">Fixed number</option></select></div><div className="space-y-1.5"><Label>{mode === 'fixed' ? 'Number of optional subjects' : 'Minimum'}</Label><Input type="number" min="0" value={min} onChange={e => { setMin(e.target.value); if (mode === 'fixed') setMax(e.target.value); }} /></div>{mode === 'range' && <div className="space-y-1.5"><Label>Maximum</Label><Input type="number" min={min || 0} value={max} onChange={e => setMax(e.target.value)} /></div>}</div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge variant="secondary">{Object.values(rules).filter(v => v === 'optional').length} optional</Badge><Badge variant="secondary">{Object.values(rules).filter(v => v === 'compulsory').length} compulsory</Badge></div><Button onClick={save} disabled={busy || !classKey || Number(min) < 0 || Number(max) < Number(min)}>{busy ? 'Saving…' : 'Save class subject rules'}</Button></div>
    </div>
  </div>;
}
