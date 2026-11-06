import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { items, LEVELS, sortArms, today } from '@/lib/school';
import { Plus, Pencil, Trash2, Search, GraduationCap, Loader2 } from 'lucide-react';

const blank = {
  full_name: '', gender: 'Male', date_of_birth: '', level: 'JSS 1', class_arm_id: '',
  guardian_name: '', guardian_phone: '', guardian_email: '', user_email: '',
  address: '', status: 'Active', admission_date: today(),
};

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [arms, setArms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [schoolInitials, setSchoolInitials] = useState('SCH');

  const load = async () => {
    const [s, a, settings] = await Promise.all([
      base44.entities.Student.list({ sort: 'full_name', limit: 500 }),
      base44.entities.ClassArm.list({ sort: 'order', limit: 200 }),
      base44.entities.SchoolSettings.list({ limit: 1 }),
    ]);
    setStudents(items(s));
    setArms(sortArms(items(a).filter((x) => x.active)));
    const school = items(settings)[0] || {};
    const initials = school.school_initials || (school.school_name || '').split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 8);
    setSchoolInitials(initials.toUpperCase() || 'SCH');
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchesLevel = levelFilter === 'all' || s.level === levelFilter;
      const matchesTerm = !term ||
        [s.full_name, s.admission_no, s.guardian_name, s.guardian_phone].some((v) => (v || '').toLowerCase().includes(term));
      return matchesLevel && matchesTerm;
    });
  }, [students, search, levelFilter]);

  const openNew = () => {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  };

  const openEdit = (student) => {
    setEditing(student);
    setForm({ ...blank, ...student });
    setOpen(true);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const setArm = (armId) => {
    const arm = arms.find((a) => a.id === armId);
    setForm((f) => ({
      ...f,
      class_arm_id: armId,
      class_arm_name: arm?.display_name || '',
      level: arm?.level || f.level,
      track: arm?.track || '',
    }));
  };

  const save = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    const payload = { ...form };
    delete payload.id;
    delete payload.created_date;
    delete payload.updated_date;
    delete payload.created_by;
    delete payload.created_by_id;
    if (!payload.track) payload.track = '';
    if (editing) {
      await base44.entities.Student.update(editing.id, payload);
    } else {
      const seq = String(students.length + 1).padStart(3, '0');
      payload.admission_no = payload.admission_no || `${schoolInitials}/${new Date().getFullYear()}/${seq}`;
      await base44.entities.Student.create(payload);
    }
    setSaving(false);
    setOpen(false);
    load();
  };

  const remove = async (student) => {
    if (!window.confirm(`Remove ${student.full_name} from the register?`)) return;
    await base44.entities.Student.delete(student.id);
    load();
  };

  return (
    <AppShell role="admin">
      <PageHeader
        title="Students"
        description="Admissions register, class placement and guardian contacts."
        actions={
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Admit student</Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, admission number or guardian" className="pl-9" />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All levels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading students…</div>
      ) : filtered.length ? (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Class</th>
                  <th className="px-4 py-3 text-left font-medium">Guardian</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.admission_no}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{s.class_arm_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{s.track || s.level}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{s.guardian_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{s.guardian_phone || s.guardian_email || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.status === 'Active' ? 'default' : 'secondary'} className="text-[11px]">{s.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="No students match this view" description="Adjust the search or admit a new student to get started." action={<Button onClick={openNew}>Admit student</Button>} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit student record' : 'Admit a new student'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input value={form.full_name} onChange={set('full_name')} placeholder="Surname first name" /></Field>
            <Field label="Gender">
              <Select value={form.gender} onValueChange={set('gender')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Date of birth"><Input type="date" value={form.date_of_birth || ''} onChange={set('date_of_birth')} /></Field>
            <Field label="Admission date"><Input type="date" value={form.admission_date || ''} onChange={set('admission_date')} /></Field>
            <Field label="Class arm">
              <Select value={form.class_arm_id || 'none'} onValueChange={(v) => setArm(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Choose a class arm" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not placed yet</SelectItem>
                  {arms.map((a) => <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={set('status')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Active', 'Graduated', 'Withdrawn', 'Suspended'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Guardian name"><Input value={form.guardian_name || ''} onChange={set('guardian_name')} /></Field>
            <Field label="Guardian phone"><Input value={form.guardian_phone || ''} onChange={set('guardian_phone')} /></Field>
            <Field label="Guardian email (links the parent portal)"><Input type="email" value={form.guardian_email || ''} onChange={set('guardian_email')} placeholder="parent@email.com" /></Field>
            <Field label="Student portal email"><Input type="email" value={form.user_email || ''} onChange={set('user_email')} placeholder="student@email.com" /></Field>
            <div className="sm:col-span-2">
              <Field label="Home address"><Input value={form.address || ''} onChange={set('address')} /></Field>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.full_name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Admit student'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}