import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { naira, today } from '@/lib/school';
import { Plus, Loader2, Check } from 'lucide-react';

export default function StaffPayroll({ staff, payments, reload, paymentRequestDay = 25 }) {
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('salary');
  const [method, setMethod] = useState('Transfer');
  const [period, setPeriod] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [salaryStaffId, setSalaryStaffId] = useState('');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [payrollHistory, setPayrollHistory] = useState({ profiles: [], payments: [] });
  const canRequestSalary = new Date().getDate() === Number(paymentRequestDay);

  useEffect(() => {
    fetch('/api/payroll/history', { credentials: 'include' }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load payroll history.');
      setPayrollHistory(data);
    }).catch((error) => setMessage(error.message));
  }, []);

  const proposeSalary = async () => {
    const person = staff.find((s) => s.id === salaryStaffId);
    if (!person || !(Number(salaryAmount) >= 0) || !effectiveDate) return;
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'salary_change', payload: { staff_id: person.id, staff_name: person.full_name, amount: Number(salaryAmount), effective_date: effectiveDate } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Salary proposal could not be submitted.');
      setMessage('Salary setup/adjustment submitted for Principal approval.');
      setSalaryStaffId(''); setSalaryAmount(''); setSalaryOpen(false);
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  const save = async () => {
    if (!canRequestSalary) { setMessage(`Salary-payment requests are accepted only on day ${paymentRequestDay} of each month.`); return; }
    const person = staff.find((s) => s.id === staffId);
    if (!person || !amount) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'salary_payment', payload: { staff_id: person.id, staff_name: person.full_name, amount: Number(amount), paid_on: today(), method, period, payment_type: type } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Salary payment proposal could not be submitted.');
      setMessage('Salary payment submitted for Principal approval. It has not been paid yet.');
      setStaffId(''); setAmount(''); setPeriod('');
      setOpen(false);
      reload();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setSalaryOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Propose salary setup / adjustment</Button>
        <Button onClick={() => setOpen(true)} disabled={!canRequestSalary} className="gap-2"><Plus className="h-4 w-4" /> Propose payment</Button>
      </div>
      {!canRequestSalary && <p className="text-right text-xs text-muted-foreground">Salary-payment requests open on day {paymentRequestDay} of each month.</p>}
      <section className="surface space-y-3 p-4">
        <h3 className="font-semibold">Approved salary history</h3>
        {payrollHistory.profiles?.length ? payrollHistory.profiles.map((p) => <div key={p.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{p.staff_name} · effective {p.effective_from}</span><strong>{naira(p.salary_amount)}</strong></div>) : <p className="text-xs text-muted-foreground">No approved salary setup or adjustment records yet.</p>}
        <h3 className="pt-2 font-semibold">Processed payments</h3>
        {payrollHistory.payments?.length ? payrollHistory.payments.map((p) => <div key={p.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{p.staff_name} · {p.paid_on} · {p.period || '—'}</span><strong>{naira(p.amount)}</strong></div>) : <p className="text-xs text-muted-foreground">No payments have been processed through the approval workflow yet.</p>}
      </section>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Staff</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-left font-medium">Paid on</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.staff_name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{p.staff_role}</p>
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px] capitalize">{p.type}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.period || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.paid_on}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{naira(p.amount)}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">Archived</td>
                </tr>
              ))}
              {!payments.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No staff payments recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Propose salary setup or adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Staff member</Label>
            <Select value={salaryStaffId} onValueChange={setSalaryStaffId}><SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger><SelectContent>{staff.map((person) => <SelectItem key={person.id} value={person.id}>{person.full_name} · {person.role}</SelectItem>)}</SelectContent></Select>
            <Label className="text-xs text-muted-foreground">Monthly salary (₦)</Label><Input type="number" min="0" value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} />
            <Label className="text-xs text-muted-foreground">Effective date</Label><Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSalaryOpen(false)}>Cancel</Button><Button disabled={saving || !salaryStaffId || salaryAmount === '' || Number(salaryAmount) < 0} onClick={proposeSalary}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Submit for Principal approval</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Propose a staff payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name} · {s.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[['salary', 'Salary'], ['allowance', 'Allowance'], ['bonus', 'Bonus'], ['deduction', 'Deduction']].map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['Transfer', 'Cash', 'Cheque'].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period</Label>
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="October 2026" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !staffId || !(Number(amount) > 0)}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Submit for approval
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}