import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not complete the staff permission request.');
  return data;
}

export default function StaffPrivilegesPanel() {
  const [directory, setDirectory] = useState({ staff: [], grants: [], catalog: [] });
  const [staffId, setStaffId] = useState('');
  const [privilegeKey, setPrivilegeKey] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDirectory(await api('/api/admin/staff-privileges'));
      setError('');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const selected = directory.staff.find((person) => person.id === staffId);
  const grants = useMemo(() => directory.grants.filter((grant) => grant.user_id === staffId), [directory.grants, staffId]);
  const grant = async () => {
    if (!staffId || !privilegeKey) return;
    setSaving(true); setMessage(''); setError('');
    try {
      await api('/api/admin/staff-privileges', 'POST', { user_id: staffId, privilege_key: privilegeKey, expires_at: expiresAt || null, note });
      setMessage('Additional privilege assigned.'); setPrivilegeKey(''); setExpiresAt(''); setNote(''); await reload();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const withdraw = async (grantId) => {
    if (!window.confirm('Withdraw this privilege now? The staff member will lose this extra access immediately.')) return;
    setSaving(true); setMessage(''); setError('');
    try { await api(`/api/admin/staff-privileges/${grantId}/withdraw`, 'POST', {}); setMessage('Privilege withdrawn.'); await reload(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const restrictAdmin = async (restricted) => {
    if (!selected || selected.role !== 'admin') return;
    setSaving(true); setMessage(''); setError('');
    try {
      await api('/api/admin/staff-access', 'POST', { user_id: selected.id, restrict_admin: restricted });
      setMessage(restricted ? 'Admin access is now limited to assigned privileges.' : 'This Admin account has its ordinary Admin access restored.');
      await reload();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4">
    <div className="surface space-y-2 p-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h2 className="font-semibold">Staff roles & additional privileges</h2></div>
      <p className="text-sm text-muted-foreground">Grant individual duties without changing a person's existing portal role. Leave the expiry blank for a permanent privilege. Expired or withdrawn privileges stop working automatically.</p>
      <p className="text-xs text-muted-foreground">Only the Primary Admin can manage these permissions. Existing Admin accounts keep their current access unless you explicitly restrict them.</p>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    {loading ? <p className="py-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Loading staff permissions…</p> : <>
      <div className="surface grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label>Staff member</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">Choose a staff account</option>{directory.staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} · {person.role} · {person.email}</option>)}</select></div>
        {selected?.role === 'admin' && <div className="rounded-md border p-3 md:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Limit this Admin account</p><p className="text-xs text-muted-foreground">When enabled, this Admin can use only the privileges assigned below. Their account remains an Admin account.</p></div><Badge variant={selected.restrict_admin ? 'default' : 'secondary'}>{selected.restrict_admin ? 'Restricted' : 'Full Admin access'}</Badge><div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving || !!selected.restrict_admin} onClick={() => restrictAdmin(true)}><ShieldOff className="mr-1 h-4 w-4"/>Limit access</Button><Button size="sm" variant="outline" disabled={saving || !selected.restrict_admin} onClick={() => restrictAdmin(false)}>Restore Admin access</Button></div></div></div>}
        <div className="space-y-2"><Label>Additional privilege</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={privilegeKey} onChange={(event) => setPrivilegeKey(event.target.value)}><option value="">Choose a responsibility</option>{directory.catalog.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>{privilegeKey && <p className="text-xs text-muted-foreground">{directory.catalog.find((item) => item.key === privilegeKey)?.description}</p>}</div>
        <div className="space-y-2"><Label>Expiry date (optional)</Label><Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} min={new Date().toISOString().slice(0, 10)}/><p className="text-xs text-muted-foreground">No date means the privilege remains until the Primary Admin withdraws it.</p></div>
        <div className="space-y-2 md:col-span-2"><Label>Reason / note (optional)</Label><Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="e.g. Cover examination timetable duties this term"/></div>
        <div className="md:col-span-2"><Button onClick={grant} disabled={saving || !staffId || !privilegeKey}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Assign privilege</Button></div>
      </div>
      <div className="surface p-4"><h3 className="mb-3 font-semibold">Privileges for {selected?.full_name || selected?.email || 'selected staff member'}</h3>{!staffId ? <p className="text-sm text-muted-foreground">Select a staff member to view their permissions.</p> : grants.length ? <div className="divide-y">{grants.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.active ? 'Active' : item.revoked_at ? 'Withdrawn' : 'Expired'} · {item.expires_at ? `Expires ${item.expires_at.slice(0, 10)}` : 'No expiry'}{item.note ? ` · ${item.note}` : ''}</p></div><div className="flex items-center gap-2"><Badge variant={item.active ? 'default' : 'secondary'}>{item.active ? 'Active' : item.revoked_at ? 'Withdrawn' : 'Expired'}</Badge>{item.active && <Button size="sm" variant="outline" disabled={saving} onClick={() => withdraw(item.id)}>Withdraw</Button>}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No additional privileges have been assigned.</p>}</div>
    </>}
  </section>;
}
