import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Landmark } from 'lucide-react';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Payment account request failed.');
  return data;
}

export default function SchoolPaymentAccounts() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ bank_name: '', account_name: '', account_number: '', purpose: 'school_fees', instructions: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = async () => { setRows(await api('/api/finance/school-accounts')); setLoading(false); };
  useEffect(() => { load().catch(e => { setError(e.message); setLoading(false); }); }, []);
  const set = (key, value) => setForm(v => ({ ...v, [key]: value }));
  const submit = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api('/api/finance/school-accounts', { method: 'POST', body: JSON.stringify(form) });
      setMessage(result.message || 'Submitted for approval.');
      setForm({ bank_name: '', account_name: '', account_number: '', purpose: 'school_fees', instructions: '' });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <section className="surface space-y-3 p-4">
      <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary"/><div><h3 className="text-sm font-semibold">Add school payment account</h3><p className="text-xs text-muted-foreground">New or changed bank details remain pending until the Principal approves them.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Bank name</Label><Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="e.g. Access Bank"/></div>
        <div className="space-y-1"><Label>Account name</Label><Input value={form.account_name} onChange={e => set('account_name', e.target.value)} placeholder="Registered school account name"/></div>
        <div className="space-y-1"><Label>10-digit account number</Label><Input inputMode="numeric" maxLength={10} value={form.account_number} onChange={e => set('account_number', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0123456789"/></div>
        <div className="space-y-1"><Label>Payment purpose</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.purpose} onChange={e => set('purpose', e.target.value)}><option value="school_fees">School fees</option><option value="other_fees">Other fees</option><option value="general">General school payments</option></select></div>
        <div className="space-y-1 sm:col-span-2"><Label>Payment instructions (optional)</Label><Input value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="Include student name and admission number in transfer narration…"/></div>
      </div>
      <Button size="sm" onClick={submit} disabled={busy || !form.bank_name.trim() || !form.account_name.trim() || form.account_number.length !== 10}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Plus className="mr-2 h-4 w-4"/>}Submit account for approval</Button>
      {message && <p role="status" className="text-xs text-success">{message}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
    <section className="surface space-y-2 p-4"><h3 className="text-sm font-semibold">School payment accounts</h3>{loading ? <p className="text-xs text-muted-foreground">Loading accounts…</p> : rows.length ? rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3"><div><p className="text-sm font-medium">{row.bank_name} · {row.account_name}</p><p className="text-xs text-muted-foreground">{row.account_number} · {row.purpose.replaceAll('_', ' ')} · Submitted {row.submitted_at?.slice(0, 10)}</p>{row.instructions && <p className="text-xs text-muted-foreground">{row.instructions}</p>}</div><Badge variant={row.status === 'active' ? 'default' : row.status === 'rejected' ? 'destructive' : 'secondary'}>{row.status}</Badge></div>) : <p className="text-xs text-muted-foreground">No school payment accounts have been added.</p>}</section>
  </div>;
}
