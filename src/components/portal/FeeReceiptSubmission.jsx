import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload } from 'lucide-react';

async function call(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Payment receipt request failed.');
  return data;
}

export default function FeeReceiptSubmission({ student, settings, fees = [] }) {
  const [rows, setRows] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feeKey, setFeeKey] = useState('school_fees');
  const [amountInput, setAmountInput] = useState('');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [submissions, recordedPayments] = await Promise.all([
      call('/api/fee-payment-submissions'),
      student?.id ? base44.entities.Payment.filter({ student_id: student.id, session: settings?.session, term: settings?.term }) : Promise.resolve([]),
    ]);
    setRows(submissions);
    setPayments(recordedPayments);
  };
  useEffect(() => {
    load().catch((error) => setMessage(error.message));
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (params.get('paystack_return') === '1' && reference) {
      call('/api/payments/paystack/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference }) })
        .then((result) => { setMessage(result.message || 'Payment verified successfully.'); window.history.replaceState({}, '', window.location.pathname); window.setTimeout(() => window.location.reload(), 700); })
        .catch((error) => { setMessage(error.message); window.history.replaceState({}, '', window.location.pathname); });
    }
  }, [student?.id, settings?.session, settings?.term]);
  useEffect(() => { setAmountInput(''); }, [student?.id, settings?.session, settings?.term]);

  const payOnline = async () => {
    if (!student?.id || !(amount > 0) || !feeKey) return;
    setOnlineBusy(true); setMessage('Connecting securely to Paystack…');
    try {
      const result = await call('/api/payments/paystack/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: student.id, fee_id: feeKey, amount: amountToSubmit, session: settings?.session, term: settings?.term, callback_path: window.location.pathname }) });
      if (!result.authorization_url) throw new Error('Paystack did not return a checkout link.');
      window.location.assign(result.authorization_url);
    } catch (error) { setMessage(error.message); setOnlineBusy(false); }
  };

  const submit = async () => {
    if (!student?.id || !(amountToSubmit > 0) || amountToSubmit > amount || !file || !selectedFeeName || alreadySubmitted) return;
    setBusy(true); setMessage('');
    try {
      const uploaded = await base44.integrations.Core.UploadPrivateFile({ file });
      await call('/api/fee-payment-submissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id, fee_id: feeKey, fee_category: feeKey === 'school_fees' ? 'school_fee' : 'other_fee', amount: amountToSubmit, reference, paid_on: paidOn, receipt_uri: uploaded.file_uri, session: settings?.session, term: settings?.term }),
      });
      setReference(''); setFile(null);
      await load(); setMessage('Receipt submitted. The Principal will review it before it appears as a payment.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const visibleRows = rows.filter((row) => row.student_id === student?.id);
  const eligibleFees = fees.filter((fee) => !fee.archived
    && (!fee.session || fee.session === settings?.session)
    && (!fee.term || fee.term === settings?.term)
    && (!fee.level || fee.level === student?.level)
    && (!fee.track || fee.track === student?.track));
  const schoolFeeItems = eligibleFees.filter((fee) => (fee.category || 'school_fee') === 'school_fee');
  const otherFees = eligibleFees.filter((fee) => fee.category === 'other_fee');
  useEffect(() => { if (!schoolFeeItems.length && otherFees.length && feeKey === 'school_fees') setFeeKey(otherFees[0].id); }, [schoolFeeItems.length, otherFees.length, feeKey]);
  const selectedFee = otherFees.find((fee) => fee.id === feeKey);
  const selectedFeeName = feeKey === 'school_fees' ? 'School fees' : selectedFee?.name || '';
  const latePenalty = selectedFee?.deadline && new Date().toISOString().slice(0, 10) > selectedFee.deadline && selectedFee.penalty_type === 'extra_fee' ? Number(selectedFee.penalty_amount) || 0 : 0;
  const feeTotal = feeKey === 'school_fees' ? schoolFeeItems.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0) : (Number(selectedFee?.amount) || 0) + latePenalty;
  const installmentsAllowed = feeKey === 'school_fees'
    ? schoolFeeItems.length > 0 && schoolFeeItems.every((fee) => fee.installments_allowed === true)
    : selectedFee?.installments_allowed === true;
  const paidSoFar = payments.reduce((sum, payment) => {
    if (payment.session !== settings?.session || payment.term !== settings?.term) return sum;
    if (feeKey === 'school_fees' ? (payment.fee_category || 'school_fee') !== 'school_fee' : payment.fee_id !== feeKey) return sum;
    const value = Number(payment.amount) || 0;
    return sum + (['refund', 'reversal'].includes(payment.type) ? -value : value);
  }, 0);
  const reserved = visibleRows.filter((row) => row.fee_id === feeKey && row.session === settings?.session && row.term === settings?.term && row.status === 'pending').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const amount = Math.max(0, feeTotal - paidSoFar - reserved);
  const amountToSubmit = installmentsAllowed && amountInput !== '' ? Number(amountInput) : amount;
  const alreadySubmitted = !installmentsAllowed && visibleRows.some((row) => row.fee_id === feeKey && row.session === settings?.session && row.term === settings?.term && ['pending', 'approved'].includes(row.status));
  return <section className="surface space-y-3 p-4">
    <div><h2 className="font-heading text-sm font-semibold">Submit a bank receipt</h2><p className="mt-1 text-xs text-muted-foreground">{student?.full_name || 'Student'} · {student?.admission_no || 'No admission number'} · {student?.class_arm_name || student?.level || 'Class not set'}. Payments remain pending until approval.</p></div>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <select aria-label="Fee to pay" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={feeKey} onChange={(event) => { setFeeKey(event.target.value); setAmountInput(''); }}>
        {schoolFeeItems.length > 0 && <option value="school_fees">School fees · ₦{schoolFeeItems.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0).toLocaleString()}</option>}
        {otherFees.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · ₦{(Number(fee.amount) || 0).toLocaleString()}</option>)}
        {!schoolFeeItems.length && !otherFees.length && <option value="">No fees set for this term</option>}
      </select>
      {installmentsAllowed ? <Input type="number" min="0.01" max={amount} value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder={`Amount up to ₦${amount.toLocaleString()}`} aria-label="Installment amount" /> : <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold">Payable: ₦{amount.toLocaleString()}{latePenalty > 0 ? ' (includes late fee)' : ''}</div>}
      <Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} aria-label="Payment date" />
      <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank reference (optional)" aria-label="Bank reference" />
      <Input type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} aria-label="Bank receipt file" />
    </div>
    {feeKey === 'school_fees' && schoolFeeItems.length > 0 && <p className="text-xs text-muted-foreground">Includes: {schoolFeeItems.map((fee) => fee.name).join(', ')}. {installmentsAllowed ? 'Bursary has enabled installments for all school-fee components.' : 'The configured balance must be paid in full.'}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={payOnline} disabled={onlineBusy || busy || !student?.id || !(Number(amountToSubmit) > 0) || Number(amountToSubmit) > amount || alreadySubmitted}>{onlineBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Pay online with Paystack</Button><Button size="sm" variant="outline" disabled={busy || onlineBusy || !student?.id || !(amount > 0) || !(Number(amountToSubmit) > 0) || Number(amountToSubmit) > amount || !file || alreadySubmitted} onClick={submit}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{alreadySubmitted ? `${selectedFeeName} submitted for this term` : 'Submit bank transfer receipt'}</Button></div>
    {visibleRows.length > 0 && <div className="space-y-2 border-t pt-3">{visibleRows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{row.fee_name} · {row.paid_on} · ₦{Number(row.amount).toLocaleString()} · {row.reference || 'Bank transfer'}</span><Badge variant={row.status === 'approved' ? 'default' : row.status === 'rejected' ? 'destructive' : 'secondary'}>{row.status === 'pending' ? 'Pending bursary approval' : row.status}</Badge></div>)}</div>}
  </section>;
}
