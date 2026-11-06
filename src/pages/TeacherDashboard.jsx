import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import NoticeList from '@/components/portal/NoticeList';
import usePortalUser from '@/lib/usePortalUser';
import { DAYS, items } from '@/lib/school';
import { BookOpen, Users, CalendarClock, NotebookPen, Loader2, ArrowUpRight } from 'lucide-react';

export default function TeacherDashboard() {
  const { user, loading } = usePortalUser();
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [notices, setNotices] = useState([]);
  const [payroll, setPayroll] = useState({ profiles: [], payments: [] });
  const [syllabusTopics, setSyllabusTopics] = useState([]);
  const [promotionHistory, setPromotionHistory] = useState([]);
  const [syllabusBusy, setSyllabusBusy] = useState('');
  const [syllabusMessage, setSyllabusMessage] = useState('');
  const [classArms, setClassArms] = useState([]);
  const [materialForm, setMaterialForm] = useState({ assignment_id: '', title: '', author: '', category: 'book', file: null });
  const [materialBusy, setMaterialBusy] = useState(false);
  const [materialMessage, setMaterialMessage] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const [asg, st, tt, nt, payrollResponse, syllabusResponse, promotionResponse, armResponse] = await Promise.all([
        base44.entities.Assignment.filter({ teacher_email: user.email }, { limit: 200 }),
        base44.entities.Student.list({ sort: 'full_name', limit: 500 }),
        base44.entities.TimetableEntry.filter({ teacher_email: user.email }, { limit: 200 }),
        base44.entities.Notice.list({ sort: '-created_date', limit: 20 }),
        fetch('/api/payroll/history', { credentials: 'include' }).then((r) => r.ok ? r.json() : ({ profiles: [], payments: [] })).catch(() => ({ profiles: [], payments: [] })),
        fetch('/api/workflows/syllabus', { credentials: 'include' }).then(async (r) => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/workflows/promotions', { credentials: 'include' }).then(async (r) => r.ok ? r.json() : []).catch(() => []),
        base44.entities.ClassArm.list({ limit: 500 }),
      ]);
      setAssignments(items(asg));
      setStudents(items(st).filter((s) => s.status === 'Active'));
      setLessons(items(tt));
      setNotices(items(nt));
      setPayroll(payrollResponse);
      setSyllabusTopics(syllabusResponse);
      setPromotionHistory(promotionResponse);
      setClassArms(items(armResponse));
      setMaterialForm((current) => ({ ...current, assignment_id: current.assignment_id || items(asg).find((assignment) => assignment.type === 'subject')?.id || '' }));
      setReady(true);
    })();
  }, [user?.email]);

  const subjectAssignments = assignments.filter((a) => a.type === 'subject');
  const formAssignments = assignments.filter((a) => a.type === 'form');
  const armIds = [...new Set(assignments.map((a) => a.class_arm_id))];
  const myStudents = students.filter((s) => armIds.includes(s.class_arm_id));
  const todayName = DAYS[Math.min(new Date().getDay() - 1, 4)];
  const todayLessons = lessons.filter((l) => l.day === todayName);

  const saveSyllabusProgress = async (topic) => {
    setSyllabusBusy(topic.id); setSyllabusMessage('');
    try {
      const response = await fetch(`/api/workflows/syllabus/${topic.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: topic.status, notes: topic.notes }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save syllabus progress.');
      setSyllabusMessage('Syllabus progress saved.');
    } catch (error) { setSyllabusMessage(error.message); }
    finally { setSyllabusBusy(''); }
  };

  const uploadMaterial = async () => {
    const assignment = subjectAssignments.find((item) => item.id === materialForm.assignment_id);
    if (!assignment || !materialForm.title.trim() || !materialForm.file) return;
    setMaterialBusy(true); setMaterialMessage('');
    try {
      const uploaded = await base44.integrations.Core.UploadPrivateFile({ file: materialForm.file });
      const arm = classArms.find((item) => item.id === assignment.class_arm_id);
      await base44.entities.ResourceItem.create({
        title: materialForm.title.trim(), author: materialForm.author.trim(), category: materialForm.category,
        subject_id: assignment.subject_id, subject_name: assignment.subject_name,
        class_arm_id: assignment.class_arm_id, level: arm?.level || '',
        file_uri: uploaded.file_uri, file_name: materialForm.file.name,
        uploaded_by: user?.full_name || user?.email || 'Teacher',
      });
      setMaterialForm((current) => ({ ...current, title: '', author: '', file: null }));
      setMaterialMessage('Material submitted for admin/principal approval.');
    } catch (error) { setMaterialMessage(error.message); }
    finally { setMaterialBusy(false); }
  };

  return (
    <AppShell role="teacher">
      <PageHeader
        title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`}
        description="Your classes, subjects and lessons for today."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Subjects" value={subjectAssignments.length} hint="Assigned to you" icon={BookOpen} />
        <StatCard label="Class arms" value={armIds.length} hint="Across all levels" icon={Users} />
        <StatCard label="Students" value={myStudents.length} hint="In your classes" icon={Users} tone="success" />
        <StatCard label="Lessons today" value={todayLessons.length} hint={todayName} icon={CalendarClock} />
      </div>

      {!ready ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your workspace…</div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="surface p-5">
              <h2 className="font-heading text-sm font-semibold">My teaching assignments</h2>
              <div className="mt-3 space-y-2">
                {subjectAssignments.map((a) => (
                  <Link key={a.id} to="/teacher/results"
                    className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 transition-colors hover:border-primary/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.subject_name}</p>
                      <p className="text-xs text-muted-foreground">{a.class_arm_name}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
                {!subjectAssignments.length && (
                  <p className="text-xs text-muted-foreground">No subject assignments yet — the administrator sets these from Staff & assignments.</p>
                )}
              </div>

              <h2 className="mt-6 font-heading text-sm font-semibold">Form teacher roles</h2>
              <div className="mt-3 space-y-2">
                {formAssignments.map((a) => (
                  <Link key={a.id} to="/teacher/attendance"
                    className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 transition-colors hover:border-primary/40">
                    <div>
                      <p className="text-sm font-medium">{a.class_arm_name}</p>
                      <p className="text-xs text-muted-foreground">Mark attendance and review the class</p>
                    </div>
                    <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
                {!formAssignments.length && <p className="text-xs text-muted-foreground">You are not a form teacher for any class arm.</p>}
              </div>
            </div>

            <div className="surface space-y-3 p-5">
              <h2 className="font-heading text-sm font-semibold">Student promotion history</h2>
              {promotionHistory.length ? promotionHistory.map((record) => <div key={record.id} className="border-t py-2 text-sm"><p className="font-medium">{record.student_name} · {record.admission_number || 'No admission number'}</p><p className="text-xs text-muted-foreground">{record.from_class || 'New admission'} → {record.to_class} · {record.promotion_date}</p></div>) : <p className="text-xs text-muted-foreground">No promotion records are available for your assigned classes.</p>}
            </div>

            <div className="surface space-y-3 p-5">
              <h2 className="font-heading text-sm font-semibold">My syllabus progress</h2>
              {syllabusMessage && <p role="status" className="text-xs text-muted-foreground">{syllabusMessage}</p>}
              {syllabusTopics.length ? syllabusTopics.map((topic) => <div key={topic.id} className="space-y-2 border-t pt-3"><p className="text-sm font-medium">Week {topic.week_number} · {topic.title} · {topic.class_key}</p><p className="text-xs text-muted-foreground">{topic.subject_id} · {topic.session_id} / {topic.term_id}</p><div className="flex flex-wrap gap-2"><select className="h-9 rounded-md border bg-background px-2 text-sm" aria-label={`Completion for week ${topic.week_number}: ${topic.title}`} value={topic.status} onChange={(e) => setSyllabusTopics((rows) => rows.map((row) => row.id === topic.id ? { ...row, status: e.target.value } : row))}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select><Input value={topic.notes || ''} placeholder="Teaching notes" onChange={(e) => setSyllabusTopics((rows) => rows.map((row) => row.id === topic.id ? { ...row, notes: e.target.value } : row))} className="min-w-48 flex-1"/><Button size="sm" disabled={syllabusBusy === topic.id} onClick={() => saveSyllabusProgress(topic)}>Save weekly progress</Button></div></div>) : <p className="text-xs text-muted-foreground">No syllabus topics have been assigned to your classes.</p>}
            </div>

            <div className="surface space-y-3 p-5">
              <h2 className="font-heading text-sm font-semibold">Upload subject material</h2>
              <p className="text-xs text-muted-foreground">Materials are sent for approval before students can see them.</p>
              {materialMessage && <p role="status" className="text-xs text-muted-foreground">{materialMessage}</p>}
              <select aria-label="Assigned subject and class" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={materialForm.assignment_id} onChange={(event) => setMaterialForm((current) => ({ ...current, assignment_id: event.target.value }))}><option value="">Choose assigned subject/class</option>{subjectAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.subject_name} · {assignment.class_arm_name}</option>)}</select>
              <Input value={materialForm.title} onChange={(event) => setMaterialForm((current) => ({ ...current, title: event.target.value }))} placeholder="Material title" />
              <div className="grid gap-2 sm:grid-cols-2"><Input value={materialForm.author} onChange={(event) => setMaterialForm((current) => ({ ...current, author: event.target.value }))} placeholder="Author (optional)" /><select className="h-9 rounded-md border bg-background px-2 text-sm" value={materialForm.category} onChange={(event) => setMaterialForm((current) => ({ ...current, category: event.target.value }))}><option value="book">Book</option><option value="syllabus">Syllabus</option><option value="exam">Exam material</option></select></div>
              <Input type="file" accept=".pdf,.doc,.docx,.txt,.ppt,.pptx" onChange={(event) => setMaterialForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} />
              <Button size="sm" disabled={materialBusy || !materialForm.assignment_id || !materialForm.title.trim() || !materialForm.file} onClick={uploadMaterial}>{materialBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Submit material for approval</Button>
            </div>

            <div className="surface p-5">
              <h2 className="font-heading text-sm font-semibold">My salary & payslip history</h2>
              {payroll.profiles?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Latest approved salary: ₦{Number(payroll.profiles[0].salary_amount).toLocaleString()} effective {payroll.profiles[0].effective_from}</p>}
              {payroll.payments?.length > 0 ? <div className="mt-3 space-y-2">{payroll.payments.map((p) => <div key={p.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{p.period || p.paid_on} · {p.method || 'Payment'}</span><strong>₦{Number(p.amount).toLocaleString()}</strong></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">No processed salary payments are available yet.</p>}
            </div>

            <div className="surface p-5">
              <h2 className="font-heading text-sm font-semibold">Today's lessons · {todayName}</h2>
              <div className="mt-3 space-y-2">
                {todayLessons.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{l.subject_name}</p>
                      <p className="text-xs text-muted-foreground">{l.class_arm_name}{l.room ? ` · ${l.room}` : ''}</p>
                    </div>
                    <span className="text-xs font-medium text-primary">{l.start_time}–{l.end_time}</span>
                  </div>
                ))}
                {!todayLessons.length && <p className="text-xs text-muted-foreground">No lessons scheduled for today.</p>}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 font-heading text-sm font-semibold">School notices</h2>
            <NoticeList notices={notices} audience="staff" />
          </div>
        </div>
      )}
    </AppShell>
  );
}