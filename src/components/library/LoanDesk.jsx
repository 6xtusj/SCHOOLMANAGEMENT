import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/EmptyState';
import { today } from '@/lib/school';
import { BookOpen, Plus, Loader2, Undo2 } from 'lucide-react';

export default function LoanDesk({ books, loans, students, staff, reload }) {
  const [open, setOpen] = useState(false);
  const [memberType, setMemberType] = useState('student');
  const [memberId, setMemberId] = useState('');
  const [bookId, setBookId] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [saving, setSaving] = useState(false);

  const available = books.filter((b) => (b.copies_available ?? 0) > 0 && b.active !== false);
  const activeLoans = loans.filter((l) => l.status === 'issued');
  const overdue = useMemo(() => activeLoans.filter((l) => l.due_on && l.due_on < today()), [activeLoans]);

  const issue = async () => {
    const book = available.find((b) => b.id === bookId);
    if (!book || !memberId || !dueOn) return;
    const member = memberType === 'student' ? students.find((s) => s.id === memberId) : staff.find((s) => s.id === memberId);
    if (!member) return;
    setSaving(true);
    await base44.entities.LibraryLoan.create({
      book_id: book.id,
      book_title: book.title,
      member_email: memberType === 'student' ? member.user_email || '' : member.email || '',
      member_name: member.full_name,
      guardian_email: memberType === 'student' ? member.guardian_email || '' : '',
      member_type: memberType,
      class_arm_name: memberType === 'student' ? member.class_arm_name || member.level || '' : '',
      issued_on: today(),
      due_on: dueOn,
      status: 'issued',
      recorded_by: 'Library desk',
    });
    await base44.entities.LibraryBook.update(book.id, {
      copies_available: Math.max((book.copies_available ?? 1) - 1, 0),
    });
    setSaving(false);
    setBookId(''); setMemberId(''); setDueOn('');
    setOpen(false);
    reload();
  };

  const markReturned = async (loan) => {
    await base44.entities.LibraryLoan.update(loan.id, { status: 'returned', returned_on: today() });
    const book = books.find((b) => b.id === loan.book_id);
    if (book) {
      await base44.entities.LibraryBook.update(book.id, {
        copies_available: Math.min((book.copies_available ?? 0) + 1, book.copies_total ?? 999),
      });
    }
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 text-sm">
          <Stat label="On loan" value={activeLoans.length} />
          <Stat label="Overdue" value={overdue.length} tone="text-warning" />
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2" disabled={!available.length}>
          <Plus className="h-4 w-4" /> Issue a book
        </Button>
      </div>

      {activeLoans.length ? (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Book</th>
                  <th className="px-4 py-3 text-left font-medium">Borrower</th>
                  <th className="px-4 py-3 text-left font-medium">Issued</th>
                  <th className="px-4 py-3 text-left font-medium">Due</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {activeLoans.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{l.book_title}</td>
                    <td className="px-4 py-3">
                      <p>{l.member_name}</p>
                      <p className="text-xs text-muted-foreground">{l.class_arm_name || l.member_type}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.issued_on}</td>
                    <td className="px-4 py-3 text-xs">
                      <Badge variant={l.due_on < today() ? 'destructive' : 'secondary'} className="text-[10px]">{l.due_on}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => markReturned(l)}>
                        <Undo2 className="h-3.5 w-3.5" /> Returned
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={BookOpen} title="No books on loan" description="Issue a title and it shows up here with its due date." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Issue a book</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Book</Label>
              <Select value={bookId} onValueChange={setBookId}>
                <SelectTrigger><SelectValue placeholder="Choose a title" /></SelectTrigger>
                <SelectContent>
                  {available.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.title} ({b.copies_available} left)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Borrower type</Label>
              <Select value={memberType} onValueChange={(v) => { setMemberType(v); setMemberId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Borrower</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
                <SelectContent>
                  {(memberType === 'student' ? students : staff).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}{memberType === 'student' ? ` · ${m.class_arm_name || m.level || ''}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Due date</Label>
              <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={issue} disabled={saving || !bookId || !memberId || !dueOn}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Issue book
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {label} <span className={`font-heading font-semibold ${tone || 'text-foreground'}`}>{value}</span>
    </span>
  );
}