import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Landmark, Check, X, Loader2 } from 'lucide-react';

export default function StaffBankDetails() {
  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [staffResponse, requestResponse] = await Promise.all([
        fetch('/api/payroll/staff-bank-details', { credentials: 'include' }),
        fetch('/api/payroll/staff-bank-change-requests', { credentials: 'include' }),
      ]);
      const [staffData, requestData] = await Promise.all([staffResponse.json().catch(() => []), requestResponse.json().catch(() => [])]);
      if (!staffResponse.ok) throw new Error(staffData.error || 'Could not load staff bank details.');
      if (!requestResponse.ok) throw new Error(requestData.error || 'Could not load pending bank-detail changes.');
      setRows(staffData); setRequests(requestData);
    } catch (e) { setError(e.message || 'Could not load staff bank details.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (request, decision) => {
    const note = window.prompt(`Optional note for ${request.staff_name} (${decision}):`, '') || '';
    setWorking(request.id); setError('');
    try {
      const response = await fetch(`/api/payroll/staff-bank-change-requests/${encodeURIComponent(request.id)}/decision`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not record the Bursary decision.');
      await load();
    } catch (e) { setError(e.message || 'Could not record the Bursary decision.'); }
    finally { setWorking(''); }
  };

  const filtered = rows.filter(r => `${r.staff_name} ${r.role} ${r.email} ${r.bank_name} ${r.account_name} ${r.account_number}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-4">
    <section className="surface space-y-3 p-4">
      <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary"/><div><h3 className="text-sm font-semibold">Bank-detail changes awaiting review</h3><p className="text-xs text-muted-foreground">Check the submitted details before approving. Current approved details remain in use until you approve a change. You cannot approve your own request.</p></div><Badge variant={requests.length ? 'default' : 'secondary'}>{requests.length} pending</Badge></div>
      {requests.length ? <div className="divide-y">{requests.map(request => <div key={request.id} className="space-y-2 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{request.staff_name} <span className="font-normal text-muted-foreground">· {request.role}</span></p><p className="text-xs text-muted-foreground">{request.email} · Submitted {request.submitted_at?.slice(0, 10)}</p><p className="mt-1 text-sm">{request.bank_name} · {request.account_name} · <span className="font-mono">{request.account_number}</span></p></div><div className="flex gap-2"><Button size="sm" onClick={() => decide(request, 'approved')} disabled={working === request.id || !!request.error}>{working === request.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Check className="mr-1 h-3.5 w-3.5"/>}Approve</Button><Button size="sm" variant="outline" onClick={() => decide(request, 'rejected')} disabled={working === request.id}><X className="mr-1 h-3.5 w-3.5"/>Reject</Button></div></div>{request.error && <p className="text-xs text-destructive">{request.error}</p>}</div>)}</div> : <p className="text-xs text-muted-foreground">There are no staff bank-detail changes waiting for review.</p>}
    </section>
    <section className="surface space-y-3 p-4">
      <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary"/><div><h3 className="text-sm font-semibold">Approved staff salary bank details</h3><p className="text-xs text-muted-foreground">Visible only to the Bursary. Use these approved details for authorised salary and staff payments.</p></div></div>
      <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search staff, role or bank…"/></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : filtered.length ? <div className="divide-y">{filtered.map(row => <div key={row.staff_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{row.staff_name} <span className="font-normal text-muted-foreground">· {row.role}</span></p><p className="text-xs text-muted-foreground">{row.email}</p><p className="mt-1 text-sm">{row.bank_name ? `${row.bank_name} · ${row.account_name} · ${row.account_number}` : 'Bank details not supplied'}</p>{row.updated_at && <p className="text-[11px] text-muted-foreground">Updated {row.updated_at.slice(0, 10)}</p>}</div><Badge variant={row.bank_name ? 'default' : 'secondary'}>{row.bank_name ? 'Details on file' : 'Not provided'}</Badge></div>)}</div> : <p className="text-xs text-muted-foreground">No matching staff records.</p>}
    </section>
  </div>;
}
