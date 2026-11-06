import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { NotebookPen, Loader2, Search, RefreshCw } from 'lucide-react';
import usePortalUser from '@/lib/usePortalUser';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export default function AdminRequests() {
  const { user } = usePortalUser();
  const [rows, setRows] = useState([]); const [responses, setResponses] = useState({}); const [busy, setBusy] = useState('');
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const [loading, setLoading] = useState(true);
  const load = async () => { setError(''); const data = await api('/api/entities/PortalRequest?sort=-created_date&limit=1000'); const list = Array.isArray(data) ? data : data?.items || []; setRows(list); setResponses(current => { const next = { ...current }; list.forEach(r => { if (next[r.id] === undefined) next[r.id] = r.response || ''; }); return next; }); };
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const visible = useMemo(() => rows.filter(r => (filter === 'all' || (r.status || 'pending') === filter) && `${r.subject} ${r.student_name} ${r.student_email} ${r.guardian_email} ${r.category} ${r.message} ${r.response}`.toLowerCase().includes(query.toLowerCase())), [rows, filter, query]);
  const act = async (row, status) => {
    setBusy(row.id); setError(''); setMessage('');
    try {
      const data = await api(`/api/requests/${encodeURIComponent(row.id)}/respond`, { method: 'POST', body: JSON.stringify({ response: responses[row.id] ?? row.response ?? '', status }) });
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...data.request } : item));
      setMessage(status === 'in_progress' ? 'School response saved.' : `Request marked ${status.replace('_', ' ')}.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };
  return <AppShell role={user?.role || 'admin'}>
    <PageHeader title="Student & parent requests" description="Review requests, send a school response and track each request through resolution."/>
    <div className="mb-4 flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search requester, subject or message…"/></div><select aria-label="Filter requests" className="h-10 rounded-md border bg-background px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select><Button variant="outline" onClick={() => { setLoading(true); load().catch(e => setError(e.message)).finally(() => setLoading(false)); }} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}{message && <p role="status" className="mb-3 text-sm text-success">{message}</p>}
    {loading ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading requests…</div> : !visible.length ? <EmptyState icon={NotebookPen} title="No matching requests" description="New student and parent requests will appear here."/> : <div className="space-y-3">{visible.map(r => <section key={r.id} className="surface space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{r.subject}</p><p className="text-xs text-muted-foreground">{r.student_name || 'Student'} · {r.student_email || r.guardian_email || 'No email'} · {r.category || 'General'} · {(r.created_date || r.created_at || '').slice(0, 10)}</p><p className="text-xs text-muted-foreground">Submitted by {r.raised_by || 'portal'}</p></div><Badge variant={r.status === 'rejected' ? 'destructive' : r.status === 'resolved' ? 'default' : 'secondary'} className="capitalize">{(r.status || 'pending').replaceAll('_', ' ')}</Badge></div><p className="whitespace-pre-wrap text-sm">{r.message || 'No additional details.'}</p><label className="block space-y-1 text-xs"><span className="text-muted-foreground">School response (visible to requester)</span><Textarea rows={3} value={responses[r.id] ?? r.response ?? ''} onChange={e => setResponses(v => ({ ...v, [r.id]: e.target.value }))} placeholder="Write the school's response…"/></label><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy === r.id} onClick={() => act(r, 'in_progress')}>{busy === r.id ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Save response'}</Button><Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r, 'resolved')}>Mark resolved</Button><Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r, 'rejected')}>Reject</Button></div>{r.handled_by && <p className="text-xs text-muted-foreground">Handled by {r.handled_by}</p>}</section>)}</div>}
  </AppShell>;
}
