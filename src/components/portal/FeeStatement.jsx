import { Badge } from '@/components/ui/badge';
import { billingFor, naira, paidFor } from '@/lib/school';

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