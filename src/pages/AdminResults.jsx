import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { items, sortArms, TERMS } from '@/lib/school';
import { getSchoolSettings } from '@/lib/schoolSettings';
import { CheckCircle2, Upload, ClipboardCheck, MessageSquare, Loader2 } from 'lucide-react';

const statusTone = {
  submitted: 'bg-warning/15 text-warning border-warning/30',
  approved: 'bg-primary/15 text-primary border-primary/30',
  published: 'bg-success/15 text-success border-success/30',
  correction: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function AdminResults() {
  const [results, setResults] = useState([]);
  const [arms, setArms] = useState([]);
  const [settings, setSettings] = useState({});
  const [session, setSession] = useState('');
  const [term, setTerm] = useState('');
  const [armId, setArmId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [commentGroup, setCommentGroup] = useState(null);
  const [notice, setNotice] = useState('');
  const [archiveRows, setArchiveRows] = useState([]);
  const [archiveAllRows, setArchiveAllRows] = useState([]);
  const [archiveSession, setArchiveSession] = useState('');
  const [archiveTerm, setArchiveTerm] = useState('');
  const [archiveClass, setArchiveClass] = useState('');
  const [archiveStudent, setArchiveStudent] = useState('');

  useEffect(() => {
    (async () => {
      const [cfg, a] = await Promise.all([
        getSchoolSettings(),
        base44.entities.ClassArm.list({ sort: 'order', limit: 200 }),
      ]);
      setSettings(cfg);
      setSession(cfg.session || '2025/2026');
      setTerm(cfg.term || 'First Term');
      setArms(sortArms(items(a)));
    })();
  }, []);

  const load = async () => {
    if (!session || !term) return;
    setLoading(true);
    const query = { session, term };
    if (armId !== 'all') query.class_arm_id = armId;
    const res = await base44.entities.Result.filter(query, { limit: 800 });
    setResults(items(res));
    setLoading(false);
  };

  useEffect(() => { load(); }, [session, term, armId]);

  const groups = useMemo(() => {
    const map = new Map();
    results.forEach((r) => {
      const key = `${r.class_arm_id}|${r.subject_id}`;
      if (!map.has(key)) {
        map.set(key, { key, armId: r.class_arm_id, subjectId: r.subject_id, arm: r.class_arm_name, subject: r.subject_name, teacher: r.teacher_email, rows: [] });
      }
      map.get(key).rows.push(r);
    });
    return [...map.values()].map((g) => {
      const statuses = g.rows.map((r) => r.status);
      const status = statuses.includes('correction') ? 'correction'
        : statuses.includes('submitted') ? 'submitted'
        : statuses.includes('approved') ? 'approved'
        : 'published';
      const average = g.rows.reduce((s, r) => s + (Number(r.total) || 0), 0) / (g.rows.length || 1);
      return { ...g, status, average: average.toFixed(1) };
    });
  }, [results]);

  const recomputePositions = async (armId) => {
    const res = await base44.entities.Result.filter({ class_arm_id: armId, session, term }, { limit: 2000 });
    const rows = items(res);
    const totals = new Map();
    rows.forEach((r) => totals.set(r.student_id, (totals.get(r.student_id) || 0) + (Number(r.total) || 0)));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const updates = [];
    ranked.forEach(([studentId], index) => {
      rows.filter((r) => r.student_id === studentId).forEach((r) => {
        updates.push({ id: r.id, position: index + 1, class_size: ranked.length });
      });
    });
    if (updates.length) await base44.entities.Result.bulkUpdate(updates);
  };

  const setStatus = async (group, status) => {
    setBusy(group.key); setNotice('');
    try {
      if (status === 'published') {
        const sessionResponse = await fetch('/api/academic/sessions', { credentials: 'include' });
        const sessionRows = await sessionResponse.json();
        if (!sessionResponse.ok) throw new Error(sessionRows.error || 'Could not resolve the academic session.');
        const sessionRow = sessionRows.find((row) => row.name === session);
        const termRow = sessionRow?.terms?.find((row) => row.name === term);
        if (!sessionRow || !termRow) throw new Error('The selected session and term must exist in School Settings before publishing.');
        const response = await fetch('/api/report-cards/publish', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionRow.id, term_id: termRow.id, class_key: group.armId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Report cards could not be published.');
        setNotice(`Archived report cards for ${data.archived_students} students.`);
      } else {
        await base44.entities.Result.bulkUpdate(group.rows.map((r) => ({ id: r.id, status })));
      }
      setBusy('');
      await load();
    } catch (error) { setNotice(error.message); setBusy(''); }
  };

  const loadArchive = async () => {
    setNotice('');
    const response = await fetch('/api/report-cards/archive', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error || 'Could not load archived report cards.'); return; }
    setArchiveAllRows(data);
    setArchiveSession(''); setArchiveTerm(''); setArchiveClass(''); setArchiveStudent('');
  };

  const archiveSessions = [...new Set(archiveAllRows.map((row) => row.session_name).filter(Boolean))].sort().reverse();
  const archiveTerms = [...new Set(archiveAllRows.filter((row) => !archiveSession || row.session_name === archiveSession).map((row) => row.term_name).filter(Boolean))];
  const archiveClasses = [...new Set(archiveAllRows.filter((row) => (!archiveSession || row.session_name === archiveSession) && (!archiveTerm || row.term_name === archiveTerm)).map((row) => row.class_arm_name).filter(Boolean))].sort();
  const archiveStudents = archiveAllRows.filter((row) => (!archiveSession || row.session_name === archiveSession) && (!archiveTerm || row.term_name === archiveTerm) && (!archiveClass || row.class_arm_name === archiveClass));
  const selectedArchiveRows = archiveStudents.filter((row) => !archiveStudent || row.student_id === archiveStudent);

  return (
    <AppShell role="admin">
      <PageHeader
        title="Results & approvals"
        description="Review subject sheets, approve them and publish report cards to students and parents."
      />

      {notice && <div role="status" className="surface mb-4 p-3 text-sm">{notice}</div>}
      <section className="surface mb-5 space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-sm font-semibold">Permanent report-card archive</h2><Button size="sm" variant="outline" onClick={loadArchive}>Search archive</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={archiveSession} onValueChange={(value) => { setArchiveSession(value); setArchiveTerm(''); setArchiveClass(''); setArchiveStudent(''); setArchiveRows([]); }}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent>{archiveSessions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={archiveTerm} onValueChange={(value) => { setArchiveTerm(value); setArchiveClass(''); setArchiveStudent(''); setArchiveRows([]); }} disabled={!archiveSession}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{archiveTerms.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={archiveClass} onValueChange={(value) => { setArchiveClass(value); setArchiveStudent(''); setArchiveRows([]); }} disabled={!archiveTerm}><SelectTrigger><SelectValue placeholder="Class arm / track" /></SelectTrigger><SelectContent>{archiveClasses.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={archiveStudent} onValueChange={(value) => { setArchiveStudent(value); setArchiveRows([]); }} disabled={!archiveClass}><SelectTrigger><SelectValue placeholder="Student" /></SelectTrigger><SelectContent>{archiveStudents.map((row) => <SelectItem key={row.student_id} value={row.student_id}>{row.student_name} · {row.admission_no || row.student_id}</SelectItem>)}</SelectContent></Select>
        </div>
        {archiveAllRows.length > 0 && <Button size="sm" variant="outline" disabled={!archiveStudent} onClick={() => setArchiveRows(selectedArchiveRows)}>Show selected report card</Button>}
        {archiveRows.length > 0 && <div className="space-y-2">{archiveRows.map((row)=> <details key={row.id} className="rounded-md border p-3" open><summary className="cursor-pointer text-sm">{row.student_name} · {row.admission_no || row.student_id} · {row.class_arm_name} · {row.session_name} / {row.term_name}</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-1 text-left">Subject</th><th className="p-1 text-right">Total</th><th className="p-1 text-left">Grade</th></tr></thead><tbody>{(row.results || []).map((result,index)=><tr key={`${row.id}-${index}`}><td className="p-1">{result.subject_name || result.subject_id}</td><td className="p-1 text-right">{result.total}</td><td className="p-1">{result.grade || '—'}</td></tr>)}</tbody></table></div></details>)}</div>}
        {archiveAllRows.length === 0 && <p className="text-xs text-muted-foreground">Load the archive, then choose a session, term, class and student.</p>}
      </section>

      <div className="surface mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Session</label>
          <Input value={session} onChange={(e) => setSession(e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Term</label>
          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class arm</label>
          <Select value={armId} onValueChange={setArmId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All class arms</SelectItem>
              {arms.map((a) => <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading result sheets…</div>
      ) : groups.length ? (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key} className="surface p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-sm font-semibold">{g.subject}</h3>
                    <Badge variant="outline" className={`text-[10px] capitalize ${statusTone[g.status]}`}>{g.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.arm} · {g.rows.length} entries · average {g.average} · {g.teacher || 'teacher not set'}
                  </p>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-primary">Preview submitted scores</summary>
                    <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="p-2 text-left">Student</th><th className="p-2 text-right">CA</th><th className="p-2 text-right">Assign</th><th className="p-2 text-right">Test</th><th className="p-2 text-right">Exam</th><th className="p-2 text-right">Total</th></tr></thead><tbody>{g.rows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-2">{row.student_name || row.student_id}</td><td className="p-2 text-right">{row.ca}</td><td className="p-2 text-right">{row.assignment_score}</td><td className="p-2 text-right">{row.test}</td><td className="p-2 text-right">{row.exam}</td><td className="p-2 text-right font-semibold">{row.total}</td></tr>)}</tbody></table></div>
                  </details>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCommentGroup(g)}>
                    <MessageSquare className="h-3.5 w-3.5" /> Comments
                  </Button>
                  {g.status === 'submitted' && (
                    <Button size="sm" className="gap-1.5" disabled={busy === g.key} onClick={() => setStatus(g, 'approved')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </Button>
                  )}
                  {g.status === 'approved' && (
                    <Button size="sm" className="gap-1.5" disabled={busy === g.key} onClick={() => setStatus(g, 'published')}>
                      <Upload className="h-3.5 w-3.5" /> Publish
                    </Button>
                  )}
                  {g.status === 'correction' && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === g.key} onClick={() => setStatus(g, 'approved')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve correction
                    </Button>
                  )}
                  {g.status !== 'correction' && (
                    <Button variant="ghost" size="sm" disabled={busy === g.key} onClick={() => setStatus(g, 'correction')}>
                      Request correction
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title="No result sheets for this term"
          description="Once subject teachers submit scores for this session and term, the sheets appear here for approval."
        />
      )}

      <CommentDialog group={commentGroup} onClose={() => setCommentGroup(null)} onSaved={load} />
    </AppShell>
  );
}

function CommentDialog({ group, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!group) return;
    const students = new Map();
    group.rows.forEach((r) => {
      if (!students.has(r.student_id)) {
        students.set(r.student_id, {
          student_id: r.student_id,
          name: r.student_name,
          form_comment: r.form_comment || '',
          principal_comment: r.principal_comment || '',
        });
      }
    });
    setRows([...students.values()]);
  }, [group]);

  const save = async () => {
    setSaving(true);
    const updates = [];
    rows.forEach((s) => {
      group.rows.filter((r) => r.student_id === s.student_id).forEach((r) => {
        updates.push({ id: r.id, form_comment: s.form_comment, principal_comment: s.principal_comment });
      });
    });
    await base44.entities.Result.bulkUpdate(updates);
    setSaving(false);
    onClose();
    onSaved();
  };

  return (
    <Dialog open={!!group} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Comments · {group?.subject} {group?.arm}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {rows.map((s, i) => (
            <div key={s.student_id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{s.name}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Textarea
                  placeholder="Form teacher's comment"
                  value={s.form_comment}
                  onChange={(e) => setRows((list) => list.map((x, idx) => (idx === i ? { ...x, form_comment: e.target.value } : x)))}
                  className="text-xs"
                />
                <Textarea
                  placeholder="Principal's comment"
                  value={s.principal_comment}
                  onChange={(e) => setRows((list) => list.map((x, idx) => (idx === i ? { ...x, principal_comment: e.target.value } : x)))}
                  className="text-xs"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save comments</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}