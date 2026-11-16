import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';

async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function AdminHandoverPage() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [requests, setRequests] = useState([]);
  const [replacementId, setReplacementId] = useState('');
  const [principalPassword, setPrincipalPassword] = useState('');
  const [reason, setReason] = useState('');
  const [acceptPassword, setAcceptPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (user?.role === 'principal') {
      const [c, r] = await Promise.all([api('/api/admin-handover/candidates'), api('/api/admin-handover')]);
      setCandidates(c); setRequests(r);
    } else {
      setRequests(await api('/api/admin-handover/mine'));
    }
  };
  useEffect(() => { refresh().catch((e) => setMessage(e.message)); }, [user?.role]);

  const run = async (fn) => { setBusy(true); setMessage(''); try { await fn(); await refresh(); } catch (e) { setMessage(e.message); } finally { setBusy(false); } };
  const initiate = () => run(async () => { await api('/api/admin-handover', 'POST', { replacement_user_id: replacementId, principal_password: principalPassword, reason }); setReplacementId(''); setPrincipalPassword(''); setReason(''); setMessage('Emergency succession request created. The proposed replacement must sign in and accept it before the Principal completes the transfer.'); });
  const accept = (id) => run(async () => { await api(`/api/admin-handover/${id}/accept`, 'POST', { password: acceptPassword }); setAcceptPassword(''); setMessage('Handover accepted. The Principal can now complete the transfer.'); });
  const complete = (id) => run(async () => { await api(`/api/admin-handover/${id}/complete`, 'POST', {}); setMessage('Admin handover completed and recorded.'); });

  return <AppShell role={user?.role === 'principal' || user?.role === 'admin' ? 'admin' : user?.role || 'student'}>
    <PageHeader title="Emergency Primary Admin succession" description="Use only when the current Primary Admin is unavailable and the school must transfer ownership to keep operating. This is separate from password recovery." />
    {message && <p role="status" className="surface mb-4 p-3 text-sm">{message}</p>}
    {user?.role === 'principal' && <section className="surface mb-5 space-y-3 p-4">
      <h2 className="font-semibold">Initiate emergency succession</h2>
      <p className="text-xs text-muted-foreground">The Principal can start this protected process when the Primary Admin cannot act. The Principal must re-enter their password and explain the emergency. The selected active staff member must accept before ownership changes.</p>
      <select className="h-10 w-full rounded-md border bg-background px-3" value={replacementId} onChange={(e) => setReplacementId(e.target.value)}><option value="">Select replacement account</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email} · {c.role}</option>)}</select>
      <textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" placeholder="Explain why the Primary Admin is unavailable and why the school needs succession now." value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      <Input type="password" autoComplete="current-password" placeholder="Confirm your Principal password" value={principalPassword} onChange={(e) => setPrincipalPassword(e.target.value)} />
      <Button disabled={busy || !replacementId || !principalPassword || reason.trim().length < 12} onClick={initiate}>Start emergency succession</Button>
    </section>}
    {user?.role === 'principal' && <section className="surface mb-5 space-y-3 p-4"><h2 className="font-semibold">Handover requests</h2>{requests.length ? requests.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm"><span>Request {r.id.slice(0, 8)} · {r.status} · replacement {r.replacement_user_id}<br/><span className="text-xs text-muted-foreground">Reason: {r.details?.reason || 'Not recorded'}</span></span>{r.status === 'accepted' && <Button size="sm" disabled={busy} onClick={() => complete(r.id)}>Complete transfer</Button>}</div>) : <p className="text-xs text-muted-foreground">No handover requests.</p>}</section>}
    {user?.role !== 'principal' && requests.length > 0 && <section className="surface space-y-3 p-4"><h2 className="font-semibold">Pending Primary Admin succession</h2><p className="text-xs text-muted-foreground">Only accept if you understand and agree to become the school's new Primary Admin. This transfers ownership, not just an ordinary Admin role.</p><Input type="password" autoComplete="current-password" placeholder="Confirm your current password" value={acceptPassword} onChange={(e) => setAcceptPassword(e.target.value)} />{requests.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm"><span>Request {r.id.slice(0, 8)} · {r.status}</span>{r.status === 'pending' && <Button size="sm" disabled={busy || !acceptPassword} onClick={() => accept(r.id)}>Accept handover</Button>}</div>)}</section>}
  </AppShell>;
}
