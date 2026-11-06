import FeeStatement from '@/components/portal/FeeStatement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { naira } from '@/lib/school';
import FeeReceiptSubmission from '@/components/portal/FeeReceiptSubmission';
import SchoolPaymentAccounts from '@/components/portal/SchoolPaymentAccounts';
import { Printer } from 'lucide-react';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function numberWords(value) {
  const units = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const scales = ['','thousand','million','billion'];
  const underThousand = (n) => {
    const parts = [];
    if (n >= 100) { parts.push(units[Math.floor(n / 100)] + ' hundred'); n %= 100; }
    if (n >= 20) { parts.push(tens[Math.floor(n / 10)] + (n % 10 ? '-' + units[n % 10] : '')); }
    else if (n > 0) parts.push(units[n]);
    return parts.join(' ');
  };
  let n = Math.max(0, Math.floor(Number(value) || 0));
  if (!n) return 'zero';
  const chunks = []; let scale = 0;
  while (n > 0 && scale < scales.length) { const chunk = n % 1000; if (chunk) chunks.unshift(`${underThousand(chunk)}${scales[scale] ? ' ' + scales[scale] : ''}`); n = Math.floor(n / 1000); scale += 1; }
  return chunks.join(' ');
}

function printReceipt(payment, student, settings = {}) {
  const win = window.open('', '_blank', 'width=850,height=950');
  if (!win) { window.alert('Please allow pop-ups to print your payment receipt.'); return; }
  const schoolName = settings.school_name || 'School';
  const logo = settings.school_logo ? `<img class="logo" src="${escapeHtml(settings.school_logo)}" alt="School logo">` : '';
  const numericAmount = Number(payment.amount || 0);
  const amount = numericAmount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountWords = `${numberWords(numericAmount)} naira${Math.round((numericAmount % 1) * 100) ? ` and ${numberWords(Math.round((numericAmount % 1) * 100))} kobo` : ''} only`; 
  const details = [
    ['Student name', student?.full_name || payment.student_name || '—'],
    ['Admission number', student?.admission_no || payment.admission_no || '—'],
    ['Class / arm', student?.class_arm_name || student?.level || '—'],
    ['Academic session', payment.session || '—'],
    ['Term', payment.term || '—'],
    ['Payment date', payment.paid_on || '—'],
    ['Receipt number', payment.receipt_no || '—'],
    ['Payment method', payment.method || '—'],
    ['Transaction reference', payment.reference || '—'],
    ['Verified by', payment.recorded_by || (payment.method === 'Paystack online' ? 'Paystack gateway verification' : 'School Bursary')],
  ];
  const rows = details.map(([label, value]) => `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payment Receipt ${escapeHtml(payment.receipt_no || '')}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;background:#f4f6f9;padding:28px}.receipt{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d8dee8;padding:34px 38px}.head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #172f52;padding-bottom:20px}.logo{width:76px;height:76px;object-fit:contain}.school{font-size:21px;font-weight:700;margin:0 0 5px}.muted{font-size:12px;color:#64748b;line-height:1.6}.title{display:flex;justify-content:space-between;align-items:center;margin:24px 0 16px}.title h2{font-size:19px;letter-spacing:1.5px;margin:0}.status{border:1px solid #15803d;color:#15803d;padding:7px 13px;border-radius:4px;font-size:11px;font-weight:bold}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}.detail{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #e7ebf1;font-size:12px}.detail span{color:#64748b}.detail strong{text-align:right}.line{margin:24px 0;border:0;border-top:1px solid #d8dee8}.amount-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px}.amount{font-size:29px;font-weight:700;color:#172f52;margin:7px 0}.foot{font-size:11px;color:#64748b;line-height:1.7;margin-top:26px;border-top:1px dashed #cbd5e1;padding-top:16px}.print{margin:18px auto 0;display:block;background:#172f52;color:#fff;border:0;border-radius:5px;padding:11px 22px;font-weight:bold;cursor:pointer}@media print{body{padding:0;background:#fff}.receipt{border:0;max-width:none;padding:20mm}.print{display:none}@page{size:A4;margin:12mm}}
    </style></head><body><main class="receipt"><header class="head">${logo}<div><h1 class="school">${escapeHtml(schoolName)}</h1><div class="muted">${escapeHtml(settings.address || '')}</div><div class="muted">${escapeHtml(settings.phone || '')}${settings.email ? ' · '+escapeHtml(settings.email) : ''}</div>${settings.motto ? `<div class="muted">${escapeHtml(settings.motto)}</div>` : ''}</div></header><div class="title"><h2>OFFICIAL PAYMENT RECEIPT</h2><span class="status">PAYMENT APPROVED</span></div><section class="grid">${rows}</section><hr class="line"><div class="amount-label">Amount received</div><div class="amount">₦${amount}</div><div class="muted">${escapeHtml(amountWords)}</div><div class="muted" style="margin-top:8px">${escapeHtml(payment.fee_name || 'School fee payment')}</div><footer class="foot">This receipt confirms that the payment above has been recorded in the school's payment ledger. Please retain it for your records. Receipt reprints do not create additional payments.<br>Issued electronically by ${escapeHtml(schoolName)}.</footer><button class="print" onclick="window.print()">Print receipt / Save as PDF</button></main></body></html>`);
  win.document.close();
}

export default function FinanceSection({ student, settings = {}, fees, payments }) {
  const history = [...(payments || [])].sort((a, b) => String(b.paid_on || '').localeCompare(String(a.paid_on || '')));
  return (
    <div className="space-y-5">
      <FeeStatement student={student} fees={fees || []} payments={payments || []} session={settings.session} term={settings.term} />
      <SchoolPaymentAccounts />
      <FeeReceiptSubmission student={student} settings={settings} fees={fees || []} />
      <div>
        <h2 className="mb-2 font-heading text-sm font-semibold">Payment history</h2>
        <div className="surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left font-medium">Receipt</th><th className="px-4 py-3 text-left font-medium">Date</th><th className="px-4 py-3 text-left font-medium">Term</th><th className="px-4 py-3 text-left font-medium">Method</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 text-right font-medium">Receipt copy</th></tr></thead>
          <tbody>{history.map((p) => <tr key={p.id} className="border-b border-border/60 last:border-0"><td className="px-4 py-3 text-xs text-muted-foreground">{p.receipt_no || '—'}</td><td className="px-4 py-3 text-xs text-muted-foreground">{p.paid_on}</td><td className="px-4 py-3 text-xs text-muted-foreground">{p.session} · {p.term}</td><td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{p.method}</Badge></td><td className={`px-4 py-3 text-right font-medium tabular-nums ${p.type === 'refund' || p.type === 'reversal' ? 'text-destructive' : ''}`}>{naira(p.amount)}</td><td className="px-4 py-3 text-right">{p.receipt_no && p.type !== 'refund' && p.type !== 'reversal' ? <Button size="sm" variant="outline" className="gap-1" onClick={() => printReceipt(p, student, settings)}><Printer className="h-3.5 w-3.5" /> Print receipt</Button> : <span className="text-xs text-muted-foreground">—</span>}</td></tr>)}
          {!history.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</td></tr>}</tbody>
        </table></div></div>
      </div>
    </div>
  );
}
