import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { billingFor, items, LEVELS, naira, paidFor, today, TRACKS } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';
import ApprovalPanel from '@/components/ApprovalPanel';
import { Plus, Trash2, Wallet, Loader2, Receipt, Search } from 'lucide-react';

export default function AdminFinance() {
  const [fees, setFees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [feeForm, setFeeForm] = useState({ name: '', level: 'all', track: 'all', amount: '' });

  const load = async () => {
    const [f, p, s, cfg] = await Promise.all([
      base44.entities.FeeItem.list({ sort: 'name', limit: 300 }),
      base44.entities.Payment.list({ sort: '-created_date', limit: 300 }),
      base44.entities.Student.list({ sort: 'full_name', limit: 500 }),
      getSchoolSettings(),
    ]);
    setFees(items(f));
    setPayments(items(p));
    setStudents(items(s).filter((x) => x.status === 'Active'));
    setSettings(cfg);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const session = settings.session || '2025/2026';
  const term = settings.term || 'First Term';

  const addFee = async () => {
    if (!feeForm.name.trim() || !feeForm.amount) return;
    const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'fee_change', payload: { operation: 'create', name: feeForm.name, level: feeForm.level === 'all' ? '' : feeForm.level, track: feeForm.track === 'all' ? '' : feeForm.track, amount: Number(feeForm.amount), session, term } }) });
    const result = await response.json();
    if (!response.ok) { window.alert(result.error || 'Could not submit fee proposal.'); return; }
    window.alert('Fee proposal submitted. It will become effective only after Principal approval.');
    setFeeForm({ name: '', level: 'all', track: 'all', amount: '' });
    load();
  };

  const removeFee = async (fee) => {
    const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'fee_change', payload: { operation: 'delete', fee_id: fee.id, name: fee.name } }) });
    const result = await response.json();
    if (!response.ok) { window.alert(result.error || 'Could not submit fee removal proposal.'); return; }
    window.alert('Fee removal submitted for Principal approval.');
    load();
  };

  const balances = useMemo(
    () =>
      students.map((s) => {
        const billed = billingFor(s, fees, session, term);
        const paid = paidFor(payments.filter((p) => p.student_id === s.id && p.session === session && p.term === term));
        return { ...s, billed, paid, balance: billed - paid };
      }),
    [students, fees, payments, session, term]
  );

  const collected = paidFor(payments.filter((p) => p.session === session && p.term === term));
  const outstanding = balances.reduce((sum, b) => sum + Math.max(b.balance, 0), 0);

  return (
    <AppShell role="admin">
      <PageHeader title="Fees & finance" description={`${session} · ${term} — billing, collections and outstanding balances.`} />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected this term</p>
          <p className="mt-1 font-heading text-xl font-semibold">{naira(collected)}</p>
        </div>
        <div className="surface p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className="mt-1 font-heading text-xl font-semibold text-warning">{naira(outstanding)}</p>
        </div>
        <div className="surface p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payments recorded</p>
          <p className="mt-1 font-heading text-xl font-semibold">{payments.length}</p>
        </div>
      </div>

      <Tabs defaultValue="payments">
        <TabsList className="mb-5">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="fees">Fee schedule</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setPayOpen(true)} className="gap-2"><Wallet className="h-4 w-4" /> Record payment</Button>
          </div>
          {loading ? (
            <Loading />
          ) : payments.length ? (
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Receipt</th>
                      <th className="px-4 py-3 text-left font-medium">Student</th>
                      <th className="px-4 py-3 text-left font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.receipt_no}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.student_name}</p>
                          <p className="text-xs text-muted-foreground">{p.class_arm_name}</p>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums">{naira(p.amount)}</td>
                        <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px] capitalize">{p.type}</Badge></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.paid_on}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => setReceipt(p)}><Receipt className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState icon={Wallet} title="No payments recorded" description="Record a payment and its receipt is generated automatically." />
          )}
        </TabsContent>

        <TabsContent value="balances">
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Student</th>
                    <th className="px-4 py-3 text-left font-medium">Class</th>
                    <th className="px-4 py-3 text-right font-medium">Billed</th>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium">{b.full_name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{b.class_arm_name || b.level}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{naira(b.billed)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{naira(b.paid)}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${b.balance > 0 ? 'text-warning' : 'text-success'}`}>
                        {naira(b.balance)}
                      </td>
                    </tr>
                  ))}
                  {!balances.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No active students yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="approvals"><ApprovalPanel role="admin" /></TabsContent>

        <TabsContent value="fees" className="space-y-4">
          <div className="surface flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Fee name</Label>
              <Input value={feeForm.name} onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })} placeholder="Tuition" className="w-44" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Level</Label>
              <Select value={feeForm.level} onValueChange={(v) => setFeeForm({ ...feeForm, level: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Track</Label>
              <Select value={feeForm.track} onValueChange={(v) => setFeeForm({ ...feeForm, track: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tracks</SelectItem>
                  {TRACKS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount (₦)</Label>
              <Input type="number" value={feeForm.amount} onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })} className="w-32" />
            </div>
            <Button onClick={addFee} className="gap-2"><Plus className="h-4 w-4" /> Submit fee for approval</Button>
          </div>

          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Fee</th>
                    <th className="px-4 py-3 text-left font-medium">Applies to</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {fees.map((f) => (
                    <tr key={f.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-medium">{f.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {[f.level || 'All levels', f.track || 'All tracks'].join(' · ')}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{naira(f.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeFee(f)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                  {!fees.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No fees set for this term yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        students={students}
        session={session}
        term={term}
        onSaved={load}
      />

      <Dialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Payment receipt</DialogTitle></DialogHeader>
          {receipt && (
            <div className="space-y-2 text-sm">
              <Line label="Receipt no." value={receipt.receipt_no} />
              <Line label="Student" value={receipt.student_name} />
              <Line label="Class" value={receipt.class_arm_name} />
              <Line label="Amount" value={naira(receipt.amount)} />
              <Line label="Method" value={receipt.method} />
              <Line label="Term" value={`${receipt.session} · ${receipt.term}`} />
              <Line label="Date" value={receipt.paid_on} />
              <Line label="Recorded by" value={receipt.recorded_by} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function PaymentDialog({ open, onClose, students, session, term, onSaved }) {
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [type, setType] = useState('payment');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = students
    .filter((s) => (s.full_name + ' ' + (s.admission_no || '')).toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  const save = async () => {
    const student = students.find((s) => s.id === studentId);
    if (!student || !amount) return;
    setSaving(true);
    await base44.entities.Payment.create({
      student_id: student.id,
      student_name: student.full_name,
      student_email: student.user_email,
      guardian_email: student.guardian_email,
      admission_no: student.admission_no,
      class_arm_name: student.class_arm_name,
      amount: Number(amount),
      method,
      reference,
      session,
      term,
      paid_on: today(),
      type,
      receipt_no: `RCPT-${Date.now().toString().slice(-7)}`,
      recorded_by: 'Administration',
    });
    setSaving(false);
    setAmount(''); setReference(''); setStudentId(''); setSearch('');
    onClose();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Record a payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Find student</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or admission number" className="pl-9" />
            </div>
            {search && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {matches.map((s) => (
                  <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setSearch(s.full_name); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{s.full_name}</span>
                    <span className="text-xs text-muted-foreground">{s.class_arm_name}</span>
                  </button>
                ))}
                {!matches.length && <p className="px-3 py-2 text-xs text-muted-foreground">No student found.</p>}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['Cash', 'Transfer', 'POS', 'Cheque'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['payment', 'Payment'], ['credit', 'Credit'], ['refund', 'Refund'], ['reversal', 'Reversal']].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving || !studentId || !amount}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading finance records…</div>;
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  );
}