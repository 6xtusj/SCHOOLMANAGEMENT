import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const TITLES = { fee_change: 'Fee schedule change', salary_change: 'Salary change', salary_payment: 'Salary payment', curriculum_change: 'Curriculum change', result_publish: 'Report publication' };
const initialPayload = { fee_change: { operation: 'create', name: '', amount: '', session: '', term: '', level: '', track: '' }, salary_change: { staff_id: '', staff_name: '', amount: '', effective_date: '' }, salary_payment: { staff_id: '', amount: '', paid_on: '' }, curriculum_change: { subject_id: '', class_key: '', change: '' }, result_publish: { class_key: '', session: '', term: '' } };
const proposalFields = {
  fee_change: [['operation', 'Change', 'select', ['create', 'delete']], ['name', 'Fee name'], ['amount', 'Amount', 'number'], ['session', 'Academic session'], ['term', 'Term'], ['level', 'Level'], ['track', 'Track'], ['fee_id', 'Fee record ID (for archive)']],
  salary_change: [['staff_name', 'Staff name'], ['staff_id', 'Staff record ID'], ['amount', 'New salary', 'number'], ['effective_date', 'Effective date', 'date']],
  salary_payment: [['staff_id', 'Staff record ID'], ['amount', 'Payment amount', 'number'], ['paid_on', 'Payment date', 'date']],
};
const formatLabel = (key) => key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ApprovalPanel({ role: roleProp = 'admin' }) {
  const { user } = useAuth();
  const role = user?.role || roleProp;
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState(role === 'bursar' ? 'fee_change' : 'fee_change');
  const [payload, setPayload] = useState(initialPayload.fee_change);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [processAmounts, setProcessAmounts] = useState({});
  const canReviewRequest = (request) => role === 'principal' || (role === 'admin' && request.kind === 'result_publish');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/approvals', { credentials: 'include' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not load approval requests.');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setMessage(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setMessage('');
    const parsed = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
    if (kind === 'fee_change' && (!parsed.name || !(Number(parsed.amount) > 0) || !parsed.session || !parsed.term)) { setMessage('Enter the fee name, positive amount, session and term.'); return; }
    if (kind === 'salary_change' && (!parsed.staff_id || !(Number(parsed.amount) >= 0) || !parsed.effective_date)) { setMessage('Enter the staff ID, salary amount and effective date.'); return; }
    if (kind === 'salary_payment' && (!parsed.staff_id || !(Number(parsed.amount) > 0) || !parsed.paid_on)) { setMessage('Enter the staff ID, positive amount and payment date.'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, payload: parsed }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Proposal could not be submitted.');
      setMessage('Proposal submitted for approval.');
      await load();
    } catch (e) { setMessage(e.message); }
    finally { setLoading(false); }
  };

  const decide = async (id, decision) => {
    setMessage('');
    try {
      const r = await fetch(`/api/approvals/${id}/decision`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Decision could not be saved.');
      setNote(''); setMessage(`Request ${decision}.`); await load();
    } catch (e) { setMessage(e.message); }
  };

  return <div className="space-y-4">
    {role !== 'admin' && role !== 'principal' && <div className="surface space-y-3 p-4">
      <h3 className="font-heading text-sm font-semibold">Submit a change for approval</h3>
      <p className="text-xs text-muted-foreground">Fee proposals change the fee schedule after approval. Salary proposals request a salary or staff-payment change. Salary changes require Principal approval.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Proposal type</Label><Select value={kind} onValueChange={(value) => { setKind(value); setPayload(initialPayload[value]); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fee_change">Fee schedule change</SelectItem><SelectItem value="salary_change">Salary change</SelectItem><SelectItem value="salary_payment">Staff payment</SelectItem></SelectContent></Select></div>
        { (proposalFields[kind] || []).map(([key, label, type = 'text', options]) => <div key={key} className="space-y-1.5"><Label>{label}</Label>{type === 'select' ? <Select value={payload[key] || ''} onValueChange={(value) => setPayload((current) => ({ ...current, [key]: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option === 'create' ? 'Add fee' : 'Archive fee'}</SelectItem>)}</SelectContent></Select> : <Input type={type} min={type === 'number' ? '0' : undefined} value={payload[key] ?? ''} onChange={(event) => setPayload((current) => ({ ...current, [key]: event.target.value }))} />}</div>)}
      </div>
      <Button onClick={submit} disabled={loading}>Submit for approval</Button>
    </div>}
    <div className="flex items-center justify-between"><h3 className="font-heading text-sm font-semibold">Approval requests</h3><Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {loading && !rows.length ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading requests…</div> : rows.length ? <div className="space-y-3">{rows.map((r) => <div key={r.id} className="surface space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{TITLES[r.kind] || r.kind}</p><p className="text-xs text-muted-foreground">Submitted {r.requested_at ? new Date(r.requested_at).toLocaleString() : ''}</p></div><Badge variant={r.status === 'pending' ? 'secondary' : 'outline'}>{r.status}</Badge></div><dl className="grid gap-x-4 gap-y-2 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-2">{Object.entries(r.payload || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined).map(([key, value]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{formatLabel(key)}</dt><dd className="text-right font-medium">{key === 'amount' ? `₦${Number(value).toLocaleString()}` : String(value)}</dd></div>)}</dl>{canReviewRequest(r) && r.status === 'pending' && <div className="flex flex-wrap gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (optional)" className="max-w-md"/><Button size="sm" onClick={() => decide(r.id, 'approved')}><Check className="mr-1 h-4 w-4"/>Approve</Button><Button size="sm" variant="outline" onClick={() => decide(r.id, 'rejected')}><X className="mr-1 h-4 w-4"/>Reject</Button></div>}{role === 'bursar' && r.kind === 'salary_payment' && ['approved','partial'].includes(r.status) && <div className="grid gap-2 sm:grid-cols-4"><Input type="number" min="0.01" placeholder={`Amount (approved ₦${Number(r.payload?.amount || 0).toLocaleString()})`} value={processAmounts[r.id] ?? ''} onChange={(e) => setProcessAmounts(v => ({...v,[r.id]:e.target.value}))}/><Input type="date" value={processAmounts[`${r.id}:date`] || new Date().toISOString().slice(0,10)} onChange={(e) => setProcessAmounts(v => ({...v,[`${r.id}:date`]:e.target.value}))}/><Input placeholder="Method" value={processAmounts[`${r.id}:method`] || ''} onChange={(e) => setProcessAmounts(v => ({...v,[`${r.id}:method`]:e.target.value}))}/><Button size="sm" disabled={loading || !(Number(processAmounts[r.id]) > 0)} onClick={async () => { setLoading(true); try { const resp = await fetch('/api/payroll/payments/process', {method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({approval_id:r.id,amount:Number(processAmounts[r.id]),paid_on:processAmounts[`${r.id}:date`] || new Date().toISOString().slice(0,10),method:processAmounts[`${r.id}:method`] || '',period:r.payload?.period || ''})}); const data=await resp.json(); if(!resp.ok) throw new Error(data.error || 'Payment could not be processed.'); setMessage(`Payment recorded. Remaining approved balance: ₦${Number(data.remaining).toLocaleString()}`); setProcessAmounts(v=>({...v,[r.id]:''})); await load(); } catch(e) { setMessage(e.message); } finally { setLoading(false); } }}>Process payment</Button></div>}</div>)}</div> : <p className="surface p-6 text-center text-sm text-muted-foreground">No approval requests yet.</p>}
  </div>;
}
