import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { naira, paidFor, today } from '@/lib/school';
import { Plus, Loader2, Search } from 'lucide-react';

export default function StudentPayments({ students, payments, fees = [], session, term, reload }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [feeKey, setFeeKey] = useState('school_fees');
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState('Cash');
  const [type, setType] = useState('payment');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = students
    .filter((s) => (s.full_name + ' ' + (s.admission_no || '')).toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);
  const student = students.find((item) => item.id === studentId);
  const availableFees = fees.filter((fee) => !fee.archived
    && (!fee.session || fee.session === session)
    && (!fee.term || fee.term === term)
    && (!fee.level || fee.level === student?.level)
    && (!fee.track || fee.track === student?.track));
  const schoolFeeItems = availableFees.filter((fee) => (fee.category || 'school_fee') === 'school_fee');
  const otherFees = availableFees.filter((fee) => fee.category === 'other_fee');
  const selectedFee = otherFees.find((fee) => fee.id === feeKey);
  const latePenalty = selectedFee?.deadline && today() > selectedFee.deadline && selectedFee.penalty_type === 'extra_fee' ? Number(selectedFee.penalty_amount) || 0 : 0;
  const feeTotal = feeKey === 'school_fees' ? schoolFeeItems.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0) : (Number(selectedFee?.amount) || 0) + latePenalty;
  const installmentsAllowed = feeKey === 'school_fees'
    ? schoolFeeItems.length > 0 && schoolFeeItems.every((fee) => fee.installments_allowed === true)
    : selectedFee?.installments_allowed === true;
  const paidSoFar = paidFor(payments.filter((payment) => payment.student_id === studentId
    && payment.session === session && payment.term === term
    && (feeKey === 'school_fees'
      ? (payment.fee_category || 'school_fee') === 'school_fee'
      : payment.fee_id === feeKey)));
  const amount = Math.max(0, feeTotal - paidSoFar);
  const amountToRecord = installmentsAllowed && amountInput !== '' ? Number(amountInput) : amount;
  const feeName = feeKey === 'school_fees' ? 'School fees' : selectedFee?.name || '';

  const save = async () => {
    if (!student || !amountToRecord || !feeName || amountToRecord > amount) return;
    setSaving(true);
    await base44.entities.Payment.create({
      student_id: student.id,
      student_name: student.full_name,
      student_email: student.user_email,
      guardian_email: student.guardian_email,
      admission_no: student.admission_no,
      class_arm_name: student.class_arm_name,
      amount: Number(amountToRecord),
      fee_id: feeKey,
      fee_name: feeName,
      fee_category: feeKey === 'school_fees' ? 'school_fee' : 'other_fee',
      method,
      reference,
      session,
      term,
      paid_on: today(),
      type,
      receipt_no: `RCPT-${Date.now().toString().slice(-7)}`,
      recorded_by: 'Bursary',
    });
    setSaving(false);
    setReference(''); setStudentId(''); setSearch(''); setFeeKey('school_fees'); setAmountInput('');
    setOpen(false);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Record payment</Button>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Receipt</th>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Term</th>
                <th className="px-4 py-3 text-left font-medium">Fee</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.receipt_no || '—'}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.student_name}</p>
                    <p className="text-xs text-muted-foreground">{p.class_arm_name}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.session} · {p.term}</td>
                  <td className="px-4 py-3 text-xs">{p.fee_name || p.note || 'Legacy payment'}</td>
                  <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{p.method}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.paid_on}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${p.type === 'refund' || p.type === 'reversal' ? 'text-destructive' : ''}`}>{naira(p.amount)}</td>
                </tr>
              ))}
              {!payments.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record a student payment</DialogTitle></DialogHeader>
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
                    <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setSearch(s.full_name); setAmountInput(''); }}
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
                <Label className="text-xs text-muted-foreground">Fee</Label>
                <Select value={feeKey} onValueChange={(value) => { setFeeKey(value); setAmountInput(''); }}>
                  <SelectTrigger><SelectValue placeholder="Choose fee" /></SelectTrigger>
                  <SelectContent>
                    {schoolFeeItems.length > 0 && <SelectItem value="school_fees">School fees total · {naira(schoolFeeItems.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0))}</SelectItem>}
                    {otherFees.map((fee) => <SelectItem key={fee.id} value={fee.id}>{fee.name} · {naira(fee.amount)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{feeName || 'Choose a student with configured fees'} balance: {naira(amount)}{latePenalty > 0 ? ' (includes late fee)' : ''}</p>
              </div>
              {installmentsAllowed && <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Installment amount (₦)</Label><Input type="number" min="0.01" max={amount} value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder={String(amount)} /></div>}
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !studentId || !amount || !feeName || !(Number(amountToRecord) > 0) || Number(amountToRecord) > amount}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}