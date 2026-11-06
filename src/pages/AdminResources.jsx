import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { items, LEVELS, today } from '@/lib/school';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Trash2, Megaphone, Library, CalendarDays, Upload, FileText, Loader2, Download } from 'lucide-react';

export default function AdminResources() {
  const [notices, setNotices] = useState([]);
  const [resources, setResources] = useState([]);
  const [events, setEvents] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentDocuments, setStudentDocuments] = useState([]);
  const [studentDocumentForm, setStudentDocumentForm] = useState({ student_id: '', title: '', category: 'other' });
  const [studentDocumentFile, setStudentDocumentFile] = useState(null);
  const [studentDocumentBusy, setStudentDocumentBusy] = useState(false);
  const [studentDocumentMessage, setStudentDocumentMessage] = useState('');
  const [noticeForm, setNoticeForm] = useState({ title: '', body: '', audience: 'all' });
  const [eventForm, setEventForm] = useState({ title: '', date: today(), type: 'event', level: 'all', description: '' });
  const [bookForm, setBookForm] = useState({ title: '', author: '', category: 'book', subject_name: '', level: 'all' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();
  const [curriculumDocs, setCurriculumDocs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [classArms, setClassArms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [curriculumFile, setCurriculumFile] = useState(null);
  const [curriculumForm, setCurriculumForm] = useState({ title: '', subject_id: '', class_key: '', session_id: '', term_id: '' });
  const [curriculumMessage, setCurriculumMessage] = useState('');
  const [curriculumBusy, setCurriculumBusy] = useState(false);
  const [syllabusTopics, setSyllabusTopics] = useState([]);
  const [syllabusForm, setSyllabusForm] = useState({ subject_id: '', class_key: '', session_id: '', term_id: '', title: '', notes: '', week_number: 1 });
  const [syllabusMessage, setSyllabusMessage] = useState('');

  const load = async () => {
    const [n, r, e, docs, periods, arms, subjectRows, topics, studentRows, documentRows] = await Promise.all([
      base44.entities.Notice.list({ sort: '-created_date', limit: 100 }),
      base44.entities.ResourceItem.list({ sort: '-created_date', limit: 200 }),
      base44.entities.CalendarEvent.list({ sort: 'date', limit: 200 }),
      fetch('/api/curriculum/documents', { credentials: 'include' }).then(async (response) => { const data = await response.json().catch(() => []); if (!response.ok) throw new Error(data.error || 'Could not load curriculum documents.'); return data; }),
      fetch('/api/academic/sessions', { credentials: 'include' }).then(async (response) => { const data = await response.json().catch(() => []); if (!response.ok) throw new Error(data.error || 'Could not load academic sessions.'); return data; }),
      base44.entities.ClassArm.list({ sort: 'order', limit: 300 }),
      base44.entities.Subject.list({ sort: 'name', limit: 500 }),
      fetch('/api/workflows/syllabus', { credentials: 'include' }).then(async (response) => { const data = await response.json().catch(() => []); if (!response.ok) throw new Error(data.error || 'Could not load syllabus topics.'); return data; }),
      base44.entities.Student.list({ sort: 'full_name', limit: 2000 }),
      base44.entities.StudentDocument.list({ sort: '-created_date', limit: 1000 }),
    ]);
    setNotices(items(n));
    setResources(items(r));
    setEvents(items(e));
    setCurriculumDocs(Array.isArray(docs) ? docs : []);
    setSessions(Array.isArray(periods) ? periods : []);
    setClassArms(items(arms));
    setSubjects(items(subjectRows));
    setSyllabusTopics(Array.isArray(topics) ? topics : []);
    setStudents(items(studentRows));
    setStudentDocuments(items(documentRows));
  };

  useEffect(() => { load(); }, []);

  const addNotice = async () => {
    if (!noticeForm.title.trim()) return;
    await base44.entities.Notice.create({ ...noticeForm, published_on: today() });
    setNoticeForm({ title: '', body: '', audience: 'all' });
    load();
  };

  const addEvent = async () => {
    if (!eventForm.title.trim()) return;
    await base44.entities.CalendarEvent.create({ ...eventForm, level: eventForm.level === 'all' ? '' : eventForm.level });
    setEventForm({ title: '', date: today(), type: 'event', level: 'all', description: '' });
    load();
  };

  const uploadStudentDocument = async () => {
    if (!studentDocumentForm.student_id || !studentDocumentForm.title.trim() || !studentDocumentFile) return;
    const student = students.find((row) => row.id === studentDocumentForm.student_id);
    if (!student) return;
    setStudentDocumentBusy(true); setStudentDocumentMessage('');
    try {
      const uploaded = await base44.integrations.Core.UploadPrivateFile({ file: studentDocumentFile });
      await base44.entities.StudentDocument.create({
        ...studentDocumentForm, student_name: student.full_name, student_email: student.user_email,
        guardian_email: student.guardian_email, class_arm_id: student.class_arm_id,
        class_arm_name: student.class_arm_name, file_uri: uploaded.file_uri,
        file_name: studentDocumentFile.name, uploaded_by: user?.full_name || user?.email || 'School office',
      });
      setStudentDocumentForm({ student_id: '', title: '', category: 'other' });
      setStudentDocumentFile(null); setStudentDocumentMessage('Document uploaded and shared with the linked student and parent.');
      await load();
    } catch (error) { setStudentDocumentMessage(error.message || 'Document upload failed.'); }
    finally { setStudentDocumentBusy(false); }
  };

  const uploadBook = async () => {
    if (!bookForm.title.trim()) return;
    setUploading(true);
    let file_uri = '';
    if (file) {
      const uploaded = await base44.integrations.Core.UploadPrivateFile({ file });
      file_uri = uploaded.file_uri;
    }
    await base44.entities.ResourceItem.create({
      ...bookForm,
      level: bookForm.level === 'all' ? '' : bookForm.level,
      file_uri,
      file_name: file?.name || '',
      uploaded_by: 'Administration',
    });
    setBookForm({ title: '', author: '', category: 'book', subject_name: '', level: 'all' });
    setFile(null);
    setUploading(false);
    load();
  };

  const openFile = async (item) => {
    if (!item.file_uri) return;
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: item.file_uri });
    window.open(signed_url, '_blank');
  };

  const terms = sessions.flatMap((session) => (session.terms || []).map((term) => ({ ...term, sessionName: session.name, sessionId: session.id })));
  const curriculumScopes = [...new Map(classArms.filter((arm) => arm.active !== false).map((arm) => {
    const level = String(arm.level || '').replace(/\s+/g, ' ').trim();
    const track = ['SS 2', 'SS 3'].includes(level) ? String(arm.track || '').replace(/s$/i, '') : '';
    const key = `${level}${track ? ` ${track}` : ''}`;
    return [key, { key, level, track }];
  })).values()];
  const curriculumArm = curriculumScopes.find((scope) => scope.key === curriculumForm.class_key);
  const curriculumSubjects = subjects.filter((subject) => subject.active !== false
    && (!curriculumArm || !(subject.levels || []).length || subject.levels.includes(curriculumArm.level))
    && (!curriculumArm?.track || !(subject.tracks || []).length || subject.tracks.some((track) => track.replace(/s$/i, '') === curriculumArm.track.replace(/s$/i, ''))));

  const addSyllabusTopic = async () => {
    setSyllabusMessage('');
    try {
      const response = await fetch('/api/workflows/syllabus', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(syllabusForm) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not add syllabus topic.');
      setSyllabusForm((current) => ({ ...current, title: '', notes: '' }));
      setSyllabusMessage('Weekly syllabus topic added.');
      await load();
    } catch (error) { setSyllabusMessage(error.message); }
  };

  const uploadCurriculum = async () => {
    if (!curriculumFile || !curriculumForm.title.trim() || !curriculumForm.subject_id || !curriculumForm.class_key || !curriculumForm.session_id || !curriculumForm.term_id) {
      setCurriculumMessage('Complete all curriculum details and choose a document.');
      return;
    }
    setCurriculumBusy(true); setCurriculumMessage('');
    try {
      const form = new FormData();
      Object.entries(curriculumForm).forEach(([key, value]) => form.append(key, value));
      form.append('file', curriculumFile);
      const response = await fetch('/api/curriculum/documents', { method: 'POST', credentials: 'include', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Curriculum upload failed.');
      setCurriculumForm({ title: '', subject_id: '', class_key: '', session_id: '', term_id: '' }); setCurriculumFile(null);
      setCurriculumMessage('Curriculum document uploaded and sent to the Principal for review.');
      await load();
    } catch (error) { setCurriculumMessage(error.message); }
    finally { setCurriculumBusy(false); }
  };

  const decideCurriculum = async (id, decision) => {
    setCurriculumBusy(true); setCurriculumMessage('');
    try {
      const response = await fetch(`/api/curriculum/documents/${id}/decision`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Curriculum decision could not be saved.');
      setCurriculumMessage(`Curriculum document ${decision}.`); await load();
    } catch (error) { setCurriculumMessage(error.message); }
    finally { setCurriculumBusy(false); }
  };

  const decideResource = async (id, decision) => {
    const response = await fetch(`/api/resources/${id}/decision`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { window.alert(data.error || 'Resource review failed.'); return; }
    await load();
  };

  const remove = async (entity, record) => {
    await base44.entities[entity].delete(record.id);
    load();
  };

  return (
    <AppShell role={user?.role || "admin"}>
      <PageHeader title="School resources" description="Notices, books and materials, and the school calendar." />
      <Tabs defaultValue="notices">
        <TabsList className="mb-5">
          <TabsTrigger value="notices">Notices</TabsTrigger>
          <TabsTrigger value="books">Books & materials</TabsTrigger>
          <TabsTrigger value="calendar">Calendar & exams</TabsTrigger>
          <TabsTrigger value="syllabus">Weekly syllabus</TabsTrigger>
          <TabsTrigger value="curriculum">Curriculum documents</TabsTrigger>
          <TabsTrigger value="student-documents">Student documents</TabsTrigger>
        </TabsList>

        <TabsContent value="notices" className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {notices.length ? notices.map((n) => (
              <div key={n.id} className="surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-sm font-semibold">{n.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{n.published_on} · {n.audience}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove('Notice', n)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                {n.body && <p className="mt-2 text-sm text-muted-foreground">{n.body}</p>}
              </div>
            )) : <EmptyState icon={Megaphone} title="No notices yet" description="Post an announcement for staff, students or parents." />}
          </div>
          <div className="surface h-fit p-5">
            <h3 className="font-heading text-sm font-semibold">New notice</h3>
            <div className="mt-3 space-y-3">
              <Input placeholder="Title" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} />
              <Textarea placeholder="Message" value={noticeForm.body} onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })} />
              <Select value={noticeForm.audience} onValueChange={(v) => setNoticeForm({ ...noticeForm, audience: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['all', 'staff', 'students', 'parents'].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={addNotice} className="w-full gap-2"><Plus className="h-4 w-4" /> Publish notice</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="books" className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {resources.length ? resources.map((r) => (
              <div key={r.id} className="surface flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.author, r.category, r.subject_name, r.level, r.status === 'pending' ? 'Awaiting approval' : ''].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {r.file_uri && <Button variant="ghost" size="icon" onClick={() => openFile(r)}><Download className="h-4 w-4" /></Button>}
                  {r.status === 'pending' && ['admin', 'principal'].includes(user?.role) && <Button size="sm" onClick={() => decideResource(r.id, 'approved')}>Approve</Button>}
                  {r.status === 'pending' && ['admin', 'principal'].includes(user?.role) && <Button size="sm" variant="outline" onClick={() => decideResource(r.id, 'rejected')}>Reject</Button>}
                  <Button variant="ghost" size="icon" onClick={() => remove('ResourceItem', r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            )) : <EmptyState icon={Library} title="No books or materials yet" description="Upload a PDF textbook or syllabus and it appears in every portal." />}
          </div>
          <div className="surface h-fit p-5">
            <h3 className="font-heading text-sm font-semibold">Add a book or material</h3>
            <div className="mt-3 space-y-3">
              <Input placeholder="Title" value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} />
              <Input placeholder="Author" value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} />
              <Select value={bookForm.category} onValueChange={(v) => setBookForm({ ...bookForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="book">School book</SelectItem>
                  <SelectItem value="syllabus">Syllabus resource</SelectItem>
                  <SelectItem value="exam">Exam material</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Subject (optional)" value={bookForm.subject_name} onChange={(e) => setBookForm({ ...bookForm, subject_name: e.target.value })} />
              <Select value={bookForm.level} onValueChange={(v) => setBookForm({ ...bookForm, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">File (PDF or document)</Label>
                <Input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
              <Button onClick={uploadBook} disabled={uploading || !bookForm.title.trim()} className="w-full gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {events.length ? events.map((e) => (
              <div key={e.id} className="surface flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.date}{e.level ? ` · ${e.level}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] capitalize">{e.type}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => remove('CalendarEvent', e)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            )) : <EmptyState icon={CalendarDays} title="Nothing on the calendar" description="Add term dates, exams and school events." />}
          </div>
          <div className="surface h-fit p-5">
            <h3 className="font-heading text-sm font-semibold">Add to calendar</h3>
            <div className="mt-3 space-y-3">
              <Input placeholder="Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
              <Input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
              <Select value={eventForm.type} onValueChange={(v) => setEventForm({ ...eventForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['event', 'School event'], ['exam', 'Examination'], ['holiday', 'Holiday'], ['term', 'Term date']].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={eventForm.level} onValueChange={(v) => setEventForm({ ...eventForm, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Whole school</SelectItem>
                  {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Description" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
              <Button onClick={addEvent} className="w-full gap-2"><Plus className="h-4 w-4" /> Add to calendar</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="syllabus" className="space-y-5">
          {syllabusMessage && <p role="status" className="surface p-3 text-sm">{syllabusMessage}</p>}
          {user?.role === 'admin' && <section className="surface space-y-3 p-5">
            <h3 className="font-heading text-sm font-semibold">Add a weekly syllabus topic</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select value={syllabusForm.subject_id} onValueChange={(value) => setSyllabusForm((current) => ({ ...current, subject_id: value }))}><SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger><SelectContent>{subjects.filter((subject) => subject.active !== false).map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name || subject.title || subject.id}</SelectItem>)}</SelectContent></Select>
              <Select value={syllabusForm.class_key} onValueChange={(value) => setSyllabusForm((current) => ({ ...current, class_key: value }))}><SelectTrigger><SelectValue placeholder="Class arm / track" /></SelectTrigger><SelectContent>{classArms.filter((arm) => arm.active !== false).map((arm) => <SelectItem key={arm.id} value={arm.id}>{arm.display_name || arm.name || arm.id}</SelectItem>)}</SelectContent></Select>
              <Input type="number" min="1" max="52" value={syllabusForm.week_number} onChange={(event) => setSyllabusForm((current) => ({ ...current, week_number: Number(event.target.value) }))} aria-label="Week number" placeholder="Week" />
              <Select value={syllabusForm.session_id} onValueChange={(value) => setSyllabusForm((current) => ({ ...current, session_id: value, term_id: '' }))}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent>{sessions.map((session) => <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>)}</SelectContent></Select>
              <Select value={syllabusForm.term_id} onValueChange={(value) => setSyllabusForm((current) => ({ ...current, term_id: value }))}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{terms.filter((term) => term.sessionId === syllabusForm.session_id).map((term) => <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>)}</SelectContent></Select>
              <Input value={syllabusForm.title} onChange={(event) => setSyllabusForm((current) => ({ ...current, title: event.target.value }))} placeholder="Topic to teach" />
              <Input value={syllabusForm.notes} onChange={(event) => setSyllabusForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Teaching notes (optional)" className="sm:col-span-2" />
            </div>
            <Button onClick={addSyllabusTopic} disabled={!syllabusForm.subject_id || !syllabusForm.class_key || !syllabusForm.session_id || !syllabusForm.term_id || !syllabusForm.title.trim()}>Add topic to week</Button>
          </section>}
          <section className="surface space-y-2 p-5">
            <h3 className="font-heading text-sm font-semibold">Topics by class and week</h3>
            {syllabusTopics.length ? [...syllabusTopics].sort((a, b) => Number(a.week_number) - Number(b.week_number)).map((topic) => <div key={topic.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"><div><p className="font-medium">Week {topic.week_number} · {topic.title}</p><p className="text-xs text-muted-foreground">{subjects.find((subject) => subject.id === topic.subject_id)?.name || topic.subject_id} · {classArms.find((arm) => arm.id === topic.class_key)?.display_name || topic.class_key} · {topic.status.replace('_', ' ')}</p></div><Badge variant="outline" className="capitalize">{topic.status.replace('_', ' ')}</Badge></div>) : <p className="text-sm text-muted-foreground">No weekly syllabus topics have been planned.</p>}
          </section>
        </TabsContent>

        <TabsContent value="curriculum" className="space-y-5">
          {curriculumMessage && <p role="status" className="surface p-3 text-sm">{curriculumMessage}</p>}
          {user?.role === 'admin' && <section className="surface space-y-3 p-5">
            <h3 className="font-heading text-sm font-semibold">Upload curriculum document</h3>
            <p className="text-xs text-muted-foreground">Documents are linked to a subject, class arm or track, academic session and term, then held for Principal review.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Document title" value={curriculumForm.title} onChange={(e) => setCurriculumForm((v) => ({ ...v, title: e.target.value }))} />
              <Select value={curriculumForm.subject_id} onValueChange={(v) => setCurriculumForm((x) => ({ ...x, subject_id: v }))}><SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger><SelectContent>{curriculumSubjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name || subject.title || subject.id}</SelectItem>)}</SelectContent></Select>
              <Select value={curriculumForm.class_key} onValueChange={(v) => setCurriculumForm((x) => ({ ...x, class_key: v, subject_id: '' }))}><SelectTrigger><SelectValue placeholder="Level / track (applies to all arms)" /></SelectTrigger><SelectContent>{curriculumScopes.map((scope) => <SelectItem key={scope.key} value={scope.key}>{scope.key} · all arms</SelectItem>)}</SelectContent></Select>
              <Select value={curriculumForm.session_id} onValueChange={(v) => setCurriculumForm((x) => ({ ...x, session_id: v, term_id: '' }))}><SelectTrigger><SelectValue placeholder="Academic session" /></SelectTrigger><SelectContent>{sessions.map((session) => <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>)}</SelectContent></Select>
              <Select value={curriculumForm.term_id} onValueChange={(v) => setCurriculumForm((x) => ({ ...x, term_id: v }))}><SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger><SelectContent>{terms.filter((term) => term.sessionId === curriculumForm.session_id).map((term) => <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>)}</SelectContent></Select>
              <Input type="file" accept=".pdf,.doc,.docx,.odt,.ppt,.pptx" onChange={(e) => setCurriculumFile(e.target.files?.[0] || null)} />
            </div>
            <Button disabled={curriculumBusy} onClick={uploadCurriculum}>{curriculumBusy ? 'Uploading…' : 'Upload for Principal review'}</Button>
          </section>}
          <section className="surface space-y-3 p-5">
            <h3 className="font-heading text-sm font-semibold">Curriculum documents</h3>
            {curriculumDocs.length ? curriculumDocs.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
              <div className="min-w-0"><p className="text-sm font-medium">{doc.title}</p><p className="text-xs text-muted-foreground">{doc.file_name} · {doc.class_key} · {doc.session_id} / {doc.term_id} · {doc.status}</p></div>
              <div className="flex flex-wrap gap-2">{doc.file_uri && <Button size="sm" variant="outline" onClick={() => window.open(doc.file_uri, '_blank', 'noopener,noreferrer')}>Open file</Button>}{user?.role === 'principal' && doc.status === 'pending' && <><Button size="sm" disabled={curriculumBusy} onClick={() => decideCurriculum(doc.id, 'approved')}>Approve</Button><Button size="sm" variant="outline" disabled={curriculumBusy} onClick={() => decideCurriculum(doc.id, 'rejected')}>Reject</Button></>}</div>
            </div>) : <p className="text-sm text-muted-foreground">No curriculum documents have been uploaded.</p>}
          </section>
        </TabsContent>
        <TabsContent value="student-documents" className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {studentDocuments.length ? studentDocuments.map((doc) => (
              <div key={doc.id} className="surface flex items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{doc.title}</p><p className="text-xs text-muted-foreground">{doc.student_name} · {doc.category} · {doc.uploaded_by || 'School office'}</p></div>
                {doc.file_uri && <Button variant="ghost" size="icon" onClick={() => openFile(doc)} aria-label="Download student document"><Download className="h-4 w-4" /></Button>}
              </div>
            )) : <EmptyState icon={FileText} title="No student documents yet" description="Upload a school document to share it with the selected student's portal and linked parent account." />}
          </div>
          <div className="surface h-fit space-y-3 p-5">
            <h3 className="font-heading text-sm font-semibold">Share a student document</h3>
            <p className="text-xs text-muted-foreground">Admin, Principal and Bursary uploads are shared with the selected student and linked parent, and can be viewed by the assigned class teacher. Other accounts cannot access the file.</p>
            <Select value={studentDocumentForm.student_id} onValueChange={(v) => setStudentDocumentForm((x) => ({ ...x, student_id: v }))}><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem key={student.id} value={student.id}>{student.full_name} · {student.admission_no || student.class_arm_name}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Document title" value={studentDocumentForm.title} onChange={(e) => setStudentDocumentForm((x) => ({ ...x, title: e.target.value }))} />
            <Select value={studentDocumentForm.category} onValueChange={(v) => setStudentDocumentForm((x) => ({ ...x, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['certificate','Certificate'],['report','Report'],['receipt','Receipt'],['letter','Letter'],['medical','Medical'],['other','Other']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            <Input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => setStudentDocumentFile(e.target.files?.[0] || null)} />
            <Button className="w-full" disabled={studentDocumentBusy || !studentDocumentForm.student_id || !studentDocumentForm.title.trim() || !studentDocumentFile} onClick={uploadStudentDocument}>{studentDocumentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload & share</Button>
            {studentDocumentMessage && <p role="status" className="text-xs text-muted-foreground">{studentDocumentMessage}</p>}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}