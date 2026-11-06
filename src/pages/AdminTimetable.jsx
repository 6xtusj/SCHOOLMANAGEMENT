import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { DAYS, items, sortArms, subjectAvailableForArm } from '@/lib/school';
import { Plus, CalendarDays, Loader2 } from 'lucide-react';

const blank = { day: 'Monday', start_time: '08:00', end_time: '08:40', subjectId: '', teacherEmail: '', room: '' };

export default function AdminTimetable() {
  const { toast } = useToast();
  const [arms, setArms] = useState([]);
  const [armId, setArmId] = useState('');
  const [entries, setEntries] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const loadEntries = async () => {
    const res = await base44.entities.TimetableEntry.list({ sort: 'start_time', limit: 500 });
    setEntries(items(res));
  };

  useEffect(() => {
    (async () => {
      const [a, s, asg, st] = await Promise.all([
        base44.entities.ClassArm.list({ sort: 'order', limit: 200 }),
        base44.entities.Subject.list({ sort: 'name', limit: 300 }),
        base44.entities.Assignment.list({ limit: 500 }),
        base44.entities.StaffProfile.list({ sort: 'full_name', limit: 200 }),
      ]);
      const activeArms = sortArms(items(a).filter((x) => x.active));
      setArms(activeArms);
      setArmId(activeArms[0]?.id || '');
      setSubjects(items(s));
      setAssignments(items(asg));
      setStaff(items(st).filter((x) => x.active));
      loadEntries();
    })();
  }, []);

  const arm = arms.find((a) => a.id === armId) || null;
  const armEntries = entries.filter((e) => e.class_arm_id === armId);

  const eligibleSubjects = useMemo(
    () => (arm ? subjects.filter((s) => s.active && subjectAvailableForArm(s, arm)) : []),
    [subjects, arm]
  );

  const teacherOptions = useMemo(() => {
    const ids = new Set(
      assignments
        .filter((a) => a.type === 'subject' && a.class_arm_id === armId && a.subject_id === form.subjectId)
        .map((a) => a.teacher_email)
    );
    return staff.filter((s) => ids.has(s.email));
  }, [assignments, armId, form.subjectId, staff]);

  const add = async () => {
    if (!arm) return;
    const subject = eligibleSubjects.find((s) => s.id === form.subjectId);
    if (!subject) {
      toast({ title: 'Choose the subject for this lesson', variant: 'destructive' });
      return;
    }
    if (form.start_time >= form.end_time) {
      toast({ title: 'The end time must be after the start time', variant: 'destructive' });
      return;
    }
    const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

    const clashArm = armEntries.find((e) => e.day === form.day && overlaps(form.start_time, form.end_time, e.start_time, e.end_time));
    if (clashArm) {
      toast({ title: 'This class arm already has a lesson then', description: `${clashArm.subject_name} ${clashArm.start_time}–${clashArm.end_time}`, variant: 'destructive' });
      return;
    }
    if (form.teacherEmail) {
      const clashTeacher = entries.find(
        (e) => e.teacher_email === form.teacherEmail && e.day === form.day && overlaps(form.start_time, form.end_time, e.start_time, e.end_time)
      );
      if (clashTeacher) {
        toast({ title: 'That teacher is already teaching then', description: `${clashTeacher.subject_name} · ${clashTeacher.class_arm_name}`, variant: 'destructive' });
        return;
      }
    }

    const teacher = staff.find((s) => s.email === form.teacherEmail);
    setSaving(true);
    await base44.entities.TimetableEntry.create({
      class_arm_id: arm.id,
      class_arm_name: arm.display_name,
      subject_id: subject.id,
      subject_name: subject.name,
      teacher_email: form.teacherEmail,
      teacher_name: teacher?.full_name || '',
      day: form.day,
      start_time: form.start_time,
      end_time: form.end_time,
      room: form.room,
    });
    setSaving(false);
    setOpen(false);
    setForm(blank);
    loadEntries();
  };

  const remove = async (entry) => {
    await base44.entities.TimetableEntry.delete(entry.id);
    loadEntries();
  };

  return (
    <AppShell role="admin">
      <PageHeader
        title="Timetable"
        description="Weekly lesson schedule per class arm, with teacher and room conflict checks."
        actions={<Button onClick={() => setOpen(true)} disabled={!arm} className="gap-2"><Plus className="h-4 w-4" /> Add lesson</Button>}
      />

      <div className="surface mb-5 p-4">
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class arm</label>
          <Select value={armId || 'none'} onValueChange={setArmId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Choose arm" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose arm</SelectItem>
              {arms.map((a) => <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {armEntries.length || arm ? (
        <div className="grid gap-3 md:grid-cols-5">
          {DAYS.map((day) => (
            <div key={day} className="surface p-3">
              <p className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</p>
              <div className="space-y-2">
                {armEntries.filter((e) => e.day === day).map((e) => (
                  <div key={e.id} className="group rounded-lg border border-border bg-background/50 p-2">
                    <p className="text-xs font-semibold text-primary">{e.start_time}–{e.end_time}</p>
                    <p className="mt-1 text-sm font-medium leading-tight">{e.subject_name}</p>
                    <p className="text-[11px] text-muted-foreground">{e.teacher_name || 'No teacher'}</p>
                    {e.room && <p className="text-[11px] text-muted-foreground">{e.room}</p>}
                    <button onClick={() => remove(e)} className="mt-1 text-[10px] text-destructive opacity-0 transition-opacity group-hover:opacity-100">
                      Remove
                    </button>
                  </div>
                ))}
                {!armEntries.some((e) => e.day === day) && <p className="text-[11px] text-muted-foreground">No lessons</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarDays} title="No lessons scheduled" description="Choose a class arm and add its first lesson." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add lesson · {arm?.display_name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Day</Label>
              <Select value={form.day} onValueChange={(v) => setForm({ ...form, day: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Room (optional)</Label>
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start time</Label>
              <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">End time</Label>
              <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Select value={form.subjectId || 'none'} onValueChange={(v) => setForm({ ...form, subjectId: v === 'none' ? '' : v, teacherEmail: '' })}>
                <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose subject</SelectItem>
                  {eligibleSubjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Teacher</Label>
              <Select value={form.teacherEmail || 'none'} onValueChange={(v) => setForm({ ...form, teacherEmail: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Assigned teacher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No teacher</SelectItem>
                  {teacherOptions.map((s) => <SelectItem key={s.id} value={s.email}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.subjectId && !teacherOptions.length && (
                <p className="text-[11px] text-warning">Assign a subject teacher for this subject first.</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={add} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add lesson</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}