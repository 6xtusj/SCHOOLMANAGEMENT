import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LEVELS, TRACKS, naira } from '@/lib/school';
import { Plus, Trash2 } from 'lucide-react';

export default function FeeSchedule({ fees, archivedFees = [], session, term, reload }) {
  const [form, setForm] = useState({ name: '', level: 'all', track: 'all', amount: '', category: 'school_fee', deadline: '', penalty_type: 'none', penalty_amount: '', installments_allowed: false });

  const add = async () => {
    if (!form.name.trim() || !form.amount) return;
    const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'fee_change', payload: { operation: 'create', name: form.name, level: form.level === 'all' ? '' : form.level, track: form.track === 'all' ? '' : form.track, amount: Number(form.amount), session, term, category: form.category, pay_once_per_term: form.category === 'school_fee', installments_allowed: form.installments_allowed, deadline: form.deadline, penalty_type: form.category === 'other_fee' ? form.penalty_type : 'none', penalty_amount: form.category === 'other_fee' && form.penalty_type === 'extra_fee' ? Number(form.penalty_amount) || 0 : 0 } }) });
    const result = await response.json();
    if (!response.ok) { window.alert(result.error || 'Could not submit fee proposal.'); return; }
    window.alert('Fee proposal submitted. It will become effective only after Principal approval.');
    setForm({ name: '', level: 'all', track: 'all', amount: '', category: 'school_fee', deadline: '', penalty_type: 'none', penalty_amount: '', installments_allowed: false });
    reload();
  };

  const remove = async (fee) => {
    const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'fee_change', payload: { operation: 'delete', fee_id: fee.id, name: fee.name } }) });
    const result = await response.json();
    if (!response.ok) { window.alert(result.error || 'Could not submit fee removal proposal.'); return; }
    window.alert('Fee removal submitted for Principal approval.');
    reload();
  };

  const setInstallmentPolicy = async (fee) => {
    const response = await fetch('/api/approvals', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'fee_change', payload: { operation: 'update', fee_id: fee.id, installments_allowed: !fee.installments_allowed } }) });
    const result = await response.json();
    if (!response.ok) { window.alert(result.error || 'Could not submit the fee payment policy.'); return; }
    window.alert('Installment policy submitted for Principal approval.');
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Fee name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tuition" className="w-44" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.installments_allowed} onChange={(e) => setForm({ ...form, installments_allowed: e.target.checked })} /> Allow installments (requires Principal approval)</label>
        <div className="space-y-1.5"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</Label><Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="school_fee">School fee component</SelectItem><SelectItem value="other_fee">Other fee</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Level</Label>
          <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Track</Label>
          <Select value={form.track} onValueChange={(v) => setForm({ ...form, track: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tracks</SelectItem>
              {TRACKS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount (₦)</Label>
          <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-32" />
        </div>
        {form.category === 'other_fee' && <><div className="space-y-1.5"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Deadline (optional)</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div><div className="space-y-1.5"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Late penalty</Label><Select value={form.penalty_type} onValueChange={(value) => setForm({ ...form, penalty_type: value })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No penalty</SelectItem><SelectItem value="extra_fee">Extra fee</SelectItem><SelectItem value="withhold_results">Withhold results</SelectItem></SelectContent></Select></div>{form.penalty_type === 'extra_fee' && <div className="space-y-1.5"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Late fee (₦)</Label><Input type="number" min="0" value={form.penalty_amount} onChange={(e) => setForm({ ...form, penalty_amount: e.target.value })} className="w-32" /></div>}</>}
        <Button onClick={add} className="gap-2"><Plus className="h-4 w-4" /> Submit fee for approval</Button>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Fee</th>
                <th className="px-4 py-3 text-left font-medium">Applies to</th>
                <th className="px-4 py-3 text-left font-medium">Term</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Payment</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{f.name}<p className="text-xs font-normal text-muted-foreground">{f.category === 'other_fee' ? 'Other fee' : 'School fee component'}</p></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{[f.level || 'All levels', f.track || 'All tracks'].join(' · ')}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{f.session} · {f.term}{f.deadline ? ` · due ${f.deadline}` : ''}{f.penalty_type === 'extra_fee' ? ` · late fee ₦${Number(f.penalty_amount).toLocaleString()}` : ''}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{naira(f.amount)}</td>
                  <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => setInstallmentPolicy(f)}>{f.installments_allowed ? 'Installments on' : 'Full payment'}</Button></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(f)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {!fees.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No fees set for this term yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {archivedFees.length > 0 && <section className="surface space-y-2 p-4"><h3 className="font-semibold">Archived fee schedules (historical)</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-left">Fee</th><th className="p-2 text-left">Session / term</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Archived</th></tr></thead><tbody>{archivedFees.map((fee) => <tr key={fee.id} className="border-b last:border-0"><td className="p-2">{fee.name}</td><td className="p-2">{fee.session} · {fee.term}</td><td className="p-2 text-right">{naira(fee.amount)}</td><td className="p-2 text-xs text-muted-foreground">{fee.archived_at || '—'}</td></tr>)}</tbody></table></div></section>}
    </div>
  );
}