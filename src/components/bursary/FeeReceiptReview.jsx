import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';

async function call(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Receipt review request failed.');
  return data;
}

export default function FeeReceiptReview() {
  const [rows, setRows] = useState([]);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => setRows(await call('/api/fee-payment-submissions'));
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  const decide = async (row, decision) => {
    setBusy(row.id); setMessage('');
    try {
      await call(`/api/fee-payment-submissions/${row.id}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: notes[row.id] || '' }),
      });
      await load(); setMessage(decision === 'approved' ? 'Receipt approved and added to the student payment ledger.' : 'Receipt rejected.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(''); }
  };

  return <section className="space-y-3">
    {message && <p role="status" className="surface p-3 text-sm">{message}</p>}
    {rows.length ? rows.map((row) => <div key={row.id} className="surface space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{row.student_name}</p><p className="text-xs text-muted-foreground">{row.admission_no || 'No admission number'} · {row.class_arm_name || 'Class not set'}</p><p className="mt-1 text-sm font-medium">{row.fee_name || 'Unspecified fee'} · {row.fee_category === 'school_fee' ? 'School fees' : 'Other fee'}</p><p className="text-xs text-muted-foreground">₦{Number(row.amount).toLocaleString()} · {row.paid_on} · {row.session} / {row.term}</p>{row.reference && <p className="text-xs text-muted-foreground">Bank reference: {row.reference}</p>}</div><Badge variant={row.status === 'pending' ? 'secondary' : row.status === 'approved' ? 'default' : 'destructive'}>{row.status}</Badge></div>
      <a href={row.receipt_uri} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">View uploaded receipt <ExternalLink className="h-3.5 w-3.5" /></a>
      {row.status === 'pending' && <div className="flex flex-wrap gap-2"><Input value={notes[row.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Review note (optional)" className="max-w-md"/><Button size="sm" disabled={!!busy} onClick={() => decide(row, 'approved')}>{busy === row.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Approve payment</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide(row, 'rejected')}><X className="mr-1 h-4 w-4" />Reject receipt</Button></div>}
      {row.decision_note && <p className="text-xs text-muted-foreground">Review note: {row.decision_note}</p>}
    </div>) : <div className="surface p-6 text-sm text-muted-foreground">No payment receipts have been submitted.</div>}
  </section>;
}
