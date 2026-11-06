import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { items } from '@/lib/school';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function CurriculumDocumentsPanel() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [arms, setArms] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState({ title: '', subject_id: '', class_key: '', session_id: '', term_id: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const [s, docs] = await Promise.all([api('/api/academic/sessions'), api('/api/curriculum/documents')]);
    setSessions(s); setDocuments(docs);
    const active = s.find((x) => (x.terms || []).some((t) => t.is_active));
    if (active) {
      const term = active.terms.find((t) => t.is_active);
      setForm((v) => ({ ...v, session_id: v.session_id || active.id, term_id: v.term_id || term.id }));
    }
  };

  useEffect(() => {
    Promise.all([
      base44.entities.Subject.list({ sort: 'name', limit: 500 }),
      base44.entities.ClassArm.list({ sort: 'order', limit: 300 }),
      refresh(),
    ]).then(([s, a]) => { setSubjects(items(s)); setArms(items(a)); }).catch((e) => setMessage(e.message));
  }, []);

  const submit = async () => {
    if (!file) { setMessage('Choose a curriculum document to upload.'); return; }
    setBusy(true); setMessage('');
    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      body.append('file', file);
      await api('/api/curriculum/documents', { method: 'POST', body });
      setFile(null); setForm((v) => ({ ...v, title: '' }));
      await refresh(); setMessage('Document uploaded and sent to the Principal for review.');
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };

  const decide = async (id, decision) => {
    setBusy(true); setMessage('');
    try { await api(`/api/curriculum/documents/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) }); await refresh(); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  };

  const terms = sessions.find((s) => s.id === form.session_id)?.terms || [];
  return <div className="space-y-4">
    {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    {user?.role === 'admin' && <section className="surface space-y-3 p-4">
      <h3 className="font-semibold">Upload curriculum or syllabus document</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs"><span>Document title</span><Input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></label>
        <label className="space-y-1 text-xs"><span>Subject</span><select className="h-10 rounded-md border bg-background px-3" value={form.subject_id} onChange={(e) => setForm((v) => ({ ...v, subject_id: e.target.value }))}><option value="">Choose subject</option>{subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span>Class arm / track</span><select className="h-10 rounded-md border bg-background px-3" value={form.class_key} onChange={(e) => setForm((v) => ({ ...v, class_key: e.target.value }))}><option value="">Choose class</option>{arms.map((x) => <option key={x.id} value={x.id}>{x.display_name || x.name}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span>Academic session</span><select className="h-10 rounded-md border bg-background px-3" value={form.session_id} onChange={(e) => setForm((v) => ({ ...v, session_id: e.target.value, term_id: '' }))}><option value="">Choose session</option>{sessions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span>Term</span><select className="h-10 rounded-md border bg-background px-3" value={form.term_id} onChange={(e) => setForm((v) => ({ ...v, term_id: e.target.value }))}><option value="">Choose term</option>{terms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="space-y-1 text-xs"><span>File (PDF, DOC, DOCX, ODT, PPT, PPTX)</span><Input type="file" accept=".pdf,.doc,.docx,.odt,.ppt,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      </div>
      <Button disabled={busy || !form.title || !form.subject_id || !form.class_key || !form.session_id || !form.term_id || !file} onClick={submit}>Upload for approval</Button>
    </section>}
    <section className="surface space-y-3 p-4">
      <h3 className="font-semibold">Curriculum documents</h3>
      {documents.length ? documents.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"><div><p className="font-medium">{doc.title}</p><p className="text-xs text-muted-foreground">{doc.file_name} · {doc.class_key} · {doc.status}</p><a className="text-xs underline" href={doc.file_uri} target="_blank" rel="noreferrer">Open document</a></div>{user?.role === 'principal' && doc.status === 'pending' && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => decide(doc.id, 'approved')}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => decide(doc.id, 'rejected')}>Reject</Button></div>}</div>) : <p className="text-sm text-muted-foreground">No curriculum documents have been uploaded.</p>}
    </section>
  </div>;
}
