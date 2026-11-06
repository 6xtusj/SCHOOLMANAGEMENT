import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import usePortalUser from '@/lib/usePortalUser';
import { gradeOf, items, TERMS } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';
import { NotebookPen, Loader2 } from 'lucide-react';

export default function TeacherResults() {
  const { user } = usePortalUser();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [settings, setSettings] = useState({});
  const [session, setSession] = useState('');
  const [term, setTerm] = useState('');
  const [students, setStudents] = useState([]);
  const [existing, setExisting] = useState({});
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewBusy, setReviewBusy] = useState('');

  useEffect(() => {
    (async () => {
      const cfg = await getSchoolSettings();
      setSettings(cfg);
      setSession(cfg.session || '2025/2026');
      setTerm(cfg.term || 'First Term');
      if (user?.email) {
        const res = await base44.entities.Assignment.filter({ teacher_email: user.email, type: 'subject' }, { limit: 200 });
        const list = items(res);
        setAssignments(list);
        setAssignmentId(list[0]?.id || '');
      }
      setLoading(false);
    })();
  }, [user?.email]);

  const refreshReviewQueue = async () => {
    const response = await fetch('/api/workflows/result-reviews', { credentials: 'include' });
    const data = await response.json().catch(() => []);
    if (response.ok) setReviewQueue(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (user?.email) refreshReviewQueue(); }, [user?.email]);

  const assignment = assignments.find((a) => a.id === assignmentId);

  useEffect(() => {
    if (!assignment || !session || !term) return;
    (async () => {
      const [st, rs] = await Promise.all([
        base44.entities.Student.filter({ class_arm_id: assignment.class_arm_id }, { limit: 400 }),
        base44.entities.Result.filter(
          { class_arm_id: assignment.class_arm_id, subject_id: assignment.subject_id, session, term },
          { limit: 400 }
        ),
      ]);
      const roster = items(st).filter((s) => s.status === 'Active');
      const records = items(rs);
      const map = Object.fromEntries(records.map((r) => [r.student_id, r]));
      setStudents(roster);
      setExisting(map);
      setScores(
        Object.fromEntries(
          roster.map((s) => {
            const r = map[s.id];
            return [s.id, {
              ca: r?.ca ?? '',
              assignment_score: r?.assignment_score ?? '',
              test: r?.test ?? '',
              exam: r?.exam ?? '',
            }];
          })
        )
      );
    })();
  }, [assignment, session, term]);

  const weights = useMemo(
    () => ({
      ca: Number(settings.ca_weight) || 40,
      assignment: Number(settings.assignment_weight) || 0,
      test: Number(settings.test_weight) || 0,
      exam: Number(settings.exam_weight) || 40,
    }),
    [settings]
  );

  const totalOf = (s) =>
    (Number(s?.ca) || 0) + (Number(s?.assignment_score) || 0) + (Number(s?.test) || 0) + (Number(s?.exam) || 0);

  const formGroups = useMemo(() => {
    const groups = new Map();
    reviewQueue.filter((review) => review.is_form_teacher && review.status === 'submitted').forEach((review) => {
      const key = `${review.class_key}|${review.subject_id}|${review.session}|${review.term}`;
      if (!groups.has(key)) groups.set(key, { key, className: review.class_arm_name, subject: review.subject_name, session: review.session, term: review.term, reviews: [] });
      groups.get(key).reviews.push(review);
    });
    return [...groups.values()];
  }, [reviewQueue]);

  const reviewGroup = async (group, decision) => {
    let note = '';
    if (decision === 'correction_requested') {
      note = window.prompt('What should the subject teacher correct?') || '';
      if (!note.trim()) return;
    }
    setReviewBusy(group.key);
    try {
      for (const review of group.reviews) {
        const response = await fetch(`/api/workflows/result-reviews/${review.id}/decision`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, note }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not save Form Teacher review.');
      }
      await refreshReviewQueue();
      toast({ title: decision === 'approved' ? 'Subject results approved' : 'Correction requested', description: `${group.subject} · ${group.className}` });
    } catch (error) { toast({ title: 'Review not saved', description: error.message, variant: 'destructive' }); }
    finally { setReviewBusy(''); }
  };

  const update = (studentId, key, value) => {
    const max = { ca: weights.ca, assignment_score: weights.assignment, test: weights.test, exam: weights.exam }[key];
    const score = value === '' ? '' : Math.max(0, Math.min(Number(value) || 0, max));
    setScores((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [key]: score } }));
  };

  const save = async (submit) => {
    if (!assignment) return;
    setSaving(true);
    const updates = [];
    const creates = [];
    students.forEach((s) => {
      const values = scores[s.id] || {};
      const filled = ['ca', 'assignment_score', 'test', 'exam'].some((k) => Number(values[k]) > 0);
      if (!filled) return;
      const total = totalOf(values);
      const payload = {
        student_id: s.id,
        student_name: s.full_name,
        student_email: s.user_email,
        guardian_email: s.guardian_email,
        admission_no: s.admission_no,
        class_arm_id: assignment.class_arm_id,
        class_arm_name: assignment.class_arm_name,
        level: s.level,
        subject_id: assignment.subject_id,
        subject_name: assignment.subject_name,
        session,
        term,
        ca: Number(values.ca) || 0,
        assignment_score: Number(values.assignment_score) || 0,
        test: Number(values.test) || 0,
        exam: Number(values.exam) || 0,
        total,
        grade: gradeOf(total).grade,
        teacher_email: user?.email || '',
        status: submit ? 'submitted' : 'submitted',
      };
      const record = existing[s.id];
      if (record) updates.push({ id: record.id, ...payload });
      else creates.push(payload);
    });
    const createdRows = creates.length ? items(await base44.entities.Result.bulkCreate(creates)) : [];
    if (updates.length) await base44.entities.Result.bulkUpdate(updates);
    const submittedIds = [...createdRows.map((row) => row.id), ...updates.map((row) => row.id)];
    for (const recordId of submittedIds) {
      const response = await fetch(`/api/workflows/results/${recordId}/submit`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Result review submission failed.');
    }
    const rs = await base44.entities.Result.filter(
      { class_arm_id: assignment.class_arm_id, subject_id: assignment.subject_id, session, term },
      { limit: 400 }
    );
    setExisting(Object.fromEntries(items(rs).map((r) => [r.student_id, r])));
    await refreshReviewQueue();
    setSaving(false);
    toast({ title: 'Results saved and sent for approval', description: `${assignment.subject_name} · ${assignment.class_arm_name}` });
  };

  if (loading) {
    return <AppShell role="teacher"><div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your subjects…</div></AppShell>;
  }

  return (
    <AppShell role="teacher">
      <PageHeader title="Subject results" description="Enter scores for the subjects assigned to you, then submit for approval." />

      {formGroups.length > 0 && <section className="surface mb-5 space-y-3 p-4">
        <div><h2 className="font-heading text-sm font-semibold">Form Teacher review</h2><p className="text-xs text-muted-foreground">Review subject sheets after all assigned subjects have complete student rosters.</p></div>
        {formGroups.map((group) => {
          const eligible = group.reviews.every((review) => review.form_eligible);
          return <div key={group.key} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div><p className="text-sm font-medium">{group.subject} · {group.className}</p><p className="text-xs text-muted-foreground">{group.reviews.length} student result(s) · {group.session} / {group.term} · {eligible ? 'All assigned subjects complete' : 'Waiting for all assigned subject results'}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!eligible || !!reviewBusy} onClick={() => reviewGroup(group, 'correction_requested')}>Request changes</Button><Button size="sm" disabled={!eligible || !!reviewBusy} onClick={() => reviewGroup(group, 'approved')}>{reviewBusy === group.key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Approve subject</Button></div>
          </div>;
        })}
      </section>}

      {!assignments.length ? (
        <EmptyState icon={NotebookPen} title="No subjects assigned yet" description="Once the administrator assigns you a subject in a class arm, it appears here." />
      ) : (
        <>
          <div className="surface mb-5 flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Subject & class</label>
              <Select value={assignmentId} onValueChange={setAssignmentId}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => <SelectItem key={a.id} value={a.id}>{a.subject_name} · {a.class_arm_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Session</label>
              <Input value={session} onChange={(e) => setSession(e.target.value)} className="w-32" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Term</label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              CA {weights.ca} · Assign {weights.assignment} · Test {weights.test} · Exam {weights.exam}
            </div>
          </div>

          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Student</th>
                    <th className="px-2 py-3 text-center font-medium">CA / {weights.ca}</th>
                    <th className="px-2 py-3 text-center font-medium">Assign / {weights.assignment}</th>
                    <th className="px-2 py-3 text-center font-medium">Test / {weights.test}</th>
                    <th className="px-2 py-3 text-center font-medium">Exam / {weights.exam}</th>
                    <th className="px-2 py-3 text-center font-medium">Total</th>
                    <th className="px-2 py-3 text-center font-medium">Grade</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const values = scores[s.id] || {};
                    const total = totalOf(values);
                    return (
                      <tr key={s.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2">
                          <p className="font-medium">{s.full_name}</p>
                          <p className="text-xs text-muted-foreground">{s.admission_no}</p>
                        </td>
                        {['ca', 'assignment_score', 'test', 'exam'].map((key) => (
                          <td key={key} className="px-2 py-2">
                            <Input
                              type="number"
                              min="0"
                              max={{ ca: weights.ca, assignment_score: weights.assignment, test: weights.test, exam: weights.exam }[key]}
                              value={values[key] ?? ''}
                              onChange={(e) => update(s.id, key, e.target.value)}
                              className="h-8 w-16 text-center"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center font-semibold tabular-nums">{total || '—'}</td>
                        <td className="px-2 py-2 text-center font-medium text-primary">{total ? gradeOf(total).grade : '—'}</td>
                        <td className="px-4 py-2 text-center">
                          {existing[s.id] ? (
                            <Badge variant="outline" className="text-[10px] capitalize">{existing[s.id].status}</Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Not entered</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!students.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No active students in this class arm.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => save(true)} disabled={saving || !students.length}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit results for approval
            </Button>
            <p className="text-xs text-muted-foreground">Submitted sheets go to the form teacher, then the principal, before publication.</p>
          </div>
        </>
      )}
    </AppShell>
  );
}