import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { subjectAvailableForArm } from '@/lib/school';
import { Plus, Trash2, Loader2, UserCog, BookMarked } from 'lucide-react';

export default function AssignmentsPanel({ arms, subjects, staff, assignments, reload }) {
  const { toast } = useToast();
  const [mode, setMode] = useState('subject');
  const [armId, setArmId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const arm = arms.find((a) => a.id === armId) || null;
  const teacher = staff.find((s) => s.email === teacherEmail) || null;

  const eligibleSubjects = useMemo(() => {
    if (!arm) return [];
    return subjects.filter((s) => s.active && subjectAvailableForArm(s, arm));
  }, [subjects, arm]);

  const armAssignments = assignments.filter((a) => a.class_arm_id === armId);
  const subjectRows = armAssignments.filter((a) => a.type === 'subject');
  const formRow = armAssignments.find((a) => a.type === 'form');

  const assign = async () => {
    if (!arm || !teacher) {
      toast({ title: 'Choose a class arm and a teacher', variant: 'destructive' });
      return;
    }
    if (mode === 'subject' && !subjectId) {
      toast({ title: 'Choose the subject this teacher will handle', variant: 'destructive' });
      return;
    }
    const subject = eligibleSubjects.find((s) => s.id === subjectId);

    if (mode === 'form' && formRow) {
      toast({
        title: 'This class arm already has a form teacher',
        description: `${formRow.teacher_name} is the current form teacher. Remove that assignment first.`,
        variant: 'destructive',
      });
      return;
    }
    if (mode === 'subject' && subjectRows.some((a) => a.teacher_email === teacher.email && a.subject_id === subjectId)) {
      toast({ title: 'Already assigned', description: `${teacher.full_name} already teaches ${subject?.name} in ${arm.display_name}.`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await base44.entities.Assignment.create({
        type: mode,
        teacher_email: teacher.email,
        teacher_name: teacher.full_name,
        class_arm_id: arm.id,
        class_arm_name: arm.display_name,
        subject_id: mode === 'subject' ? subject?.id : '',
        subject_name: mode === 'subject' ? subject?.name : '',
      });
      toast({ title: mode === 'subject' ? 'Subject teacher assigned' : 'Form teacher assigned', description: `${teacher.full_name} · ${arm.display_name}` });
      setSubjectId('');
      await reload();
    } catch (error) {
      toast({ title: 'The assignment could not be saved', description: error?.message || 'Try again.', variant: 'destructive' });
    }
    setSaving(false);
  };

  const remove = async (assignment) => {
    await base44.entities.Assignment.delete(assignment.id);
    await reload();
  };

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <h3 className="font-heading text-sm font-semibold">Assign a teacher</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick the class arm first — subjects and teachers are filtered to what that arm actually offers.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Assignment type</label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subject">Subject teacher</SelectItem>
                <SelectItem value="form">Form teacher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class arm</label>
            <Select value={armId || 'none'} onValueChange={(v) => { setArmId(v === 'none' ? '' : v); setSubjectId(''); }}>
              <SelectTrigger><SelectValue placeholder="Choose arm" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose arm</SelectItem>
                {arms.map((a) => <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject</label>
            <Select value={mode === 'form' ? 'none' : subjectId || 'none'} onValueChange={(v) => setSubjectId(v === 'none' ? '' : v)} disabled={mode === 'form' || !arm}>
              <SelectTrigger><SelectValue placeholder={mode === 'form' ? 'Not needed' : 'Choose subject'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{mode === 'form' ? 'Not needed' : 'Choose subject'}</SelectItem>
                {eligibleSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Teacher</label>
            <Select value={teacherEmail || 'none'} onValueChange={(v) => setTeacherEmail(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Choose teacher" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose teacher</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.email}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={assign} disabled={saving} className="mt-4 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save assignment
        </Button>
      </div>

      {arm && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="surface p-5">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-primary" />
              <h3 className="font-heading text-sm font-semibold">Form teacher · {arm.display_name}</h3>
            </div>
            {formRow ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2">
                <span className="text-sm">{formRow.teacher_name}</span>
                <Button variant="ghost" size="icon" onClick={() => remove(formRow)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No form teacher assigned to this arm yet.</p>
            )}
          </div>

          <div className="surface p-5">
            <div className="flex items-center gap-2">
              <BookMarked className="h-4 w-4 text-primary" />
              <h3 className="font-heading text-sm font-semibold">Subject teachers · {arm.display_name}</h3>
            </div>
            <div className="mt-3 space-y-2">
              {subjectRows.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.subject_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.teacher_name}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
              {!subjectRows.length && <p className="text-xs text-muted-foreground">No subject teachers assigned yet.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="surface overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-heading text-sm font-semibold">All saved assignments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Teacher</th>
                <th className="px-4 py-2 text-left font-medium">Class arm</th>
                <th className="px-4 py-2 text-left font-medium">Subject</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">{a.teacher_name}</td>
                  <td className="px-4 py-2">{a.class_arm_name}</td>
                  <td className="px-4 py-2">{a.subject_name || '—'}</td>
                  <td className="px-4 py-2"><Badge variant="secondary" className="text-[10px] capitalize">{a.type}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {!assignments.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing assigned yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}