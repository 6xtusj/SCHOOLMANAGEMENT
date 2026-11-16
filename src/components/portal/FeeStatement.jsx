import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { billingFor, naira, paidFor } from '@/lib/school';


function printPaymentReceipt(student, payment) {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const rows = [
    ['Receipt number', payment.receipt_no || payment.id || '—'],
    ['Student', student.full_name || payment.student_name || '—'],
    ['Admission number', student.admission_no || payment.admission_no || '—'],
    ['Class', student.class_arm_name || payment.class_arm_name || '—'],
    ['Fee', payment.fee_name || 'School fees'],
    ['Amount', `₦${Number(payment.amount || 0).toLocaleString()}`],
    ['Payment date', payment.paid_on || '—'],
    ['Payment method', payment.method || '—'],
    ['Reference', payment.reference || '—'],
    ['Academic session', payment.session || '—'],
    ['Term', payment.term || '—'],
    ['Status', 'APPROVED · RECORDED BY SCHOOL'],
  ];
  const popup = window.open('', '_blank', 'width=760,height=850');
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>Payment receipt</title><style>body{font:14px Arial,sans-serif;color:#111;padding:36px;max-width:720px;margin:auto}h1{text-align:center;font-size:22px}p{text-align:center;color:#555}.row{display:flex;justify-content:space-between;gap:20px;padding:12px 4px;border-bottom:1px solid #ddd}.status{margin-top:24px;padding:14px;background:#eef8ef;text-align:center;font-weight:bold}@media print{button{display:none}body{padding:0}}</style></head><body><h1>OFFICIAL PAYMENT RECEIPT</h1><p>School fee payment confirmation</p>${rows.map(([label,value])=>`<div class="row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}<div class="status">PAYMENT APPROVED</div><p>This receipt confirms that the payment has been recorded in the school's payment ledger.</p><button onclick="window.print()">Print receipt</button></body></html>`);
  popup.document.close();
  popup.focus();
}

export default function FeeStatement({ student, fees, payments, session, term }) {
  const billed = billingFor(student, fees, session, term);
  const termPayments = (payments || []).filter((payment) => (!payment.session || payment.session === session) && (!payment.term || payment.term === term));
  const paid = paidFor(termPayments);
  const balance = billed - paid;
  const schoolFeeItems = (fees || []).filter((fee) => (fee.category || 'school_fee') === 'school_fee'
    && (!fee.session || fee.session === session) && (!fee.term || fee.term === term)
    && (!fee.level || fee.level === student.level) && (!fee.track || fee.track === student.track));
  const schoolFeeBilled = schoolFeeItems.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);
  const schoolFeePaid = (payments || []).filter((payment) => (!payment.session || payment.session === session) && (!payment.term || payment.term === term) && (payment.fee_category || 'school_fee') === 'school_fee' && !['refund', 'reversal'].includes(payment.type)).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const schoolFeesSettled = schoolFeeBilled === 0 || schoolFeePaid >= schoolFeeBilled;
  const items = fees.filter(
    (f) =>
      (!f.session || f.session === session) &&
      (!f.term || f.term === term) &&
      (!f.level || f.level === student.level) &&
      (!f.track || f.track === student.track)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Billed" value={naira(billed)} />
        <Card label="Paid" value={naira(paid)} />
        <Card label="Balance" value={naira(balance)} tone={balance > 0 ? 'text-warning' : 'text-success'} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border px-4 py-3"><div><p className="text-sm font-medium">School fees · {session} {term}</p><p className="text-xs text-muted-foreground">Paid {naira(schoolFeePaid)} of {naira(schoolFeeBilled)}</p></div><Badge variant={schoolFeesSettled ? 'default' : 'destructive'}>{schoolFeesSettled ? 'Paid' : 'Outstanding'}</Badge></div>

      <div className="surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-heading text-sm font-semibold">Fee items · {session} {term}</h3>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">{f.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{naira(f.amount)}</td>
              </tr>
            ))}
            {!items.length && <tr><td className="px-4 py-6 text-center text-sm text-muted-foreground">No fees set for this term.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-heading text-sm font-semibold">Payment history</h3>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {termPayments.map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">
                  <p>{p.fee_name || p.receipt_no}</p>
                  <p className="text-xs text-muted-foreground">{p.paid_on} · {p.method}</p>
                </td>
                <td className="px-4 py-2 text-right">
                  <p className="tabular-nums">{naira(p.amount)}</p>
                  <Badge variant="secondary" className="mt-1 text-[10px] capitalize">{p.type}</Badge>
                  {p.type === 'payment' && <Button type="button" size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => printPaymentReceipt(student, p)}>Print receipt</Button>}
                </td>
              </tr>
            ))}
            {!payments.length && <tr><td className="px-4 py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, tone }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-heading text-lg font-semibold ${tone || ''}`}>{value}</p>
    </div>
  );
}