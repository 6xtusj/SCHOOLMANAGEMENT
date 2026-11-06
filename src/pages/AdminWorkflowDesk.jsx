import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const API = '/api/workflows';
async function call(path, method = 'GET', body) {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}
const blank = { student_id: '', student_name: '', admission_number: '', from_class: '', to_class: '', session_id: '', promotion_date: new Date().toISOString().slice(0, 10), admin_track_change_authorised: false };
export default function AdminWorkflowDesk() {
  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [classArms, setClassArms] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [subjectRequests, setSubjectRequests] = useState([]);
  const [timetableEntries, setTimetableEntries] = useState([]);
  const [recovery, setRecovery] = useState({ user_id: '' });
  const [recoveryUrl, setRecoveryUrl] = useState('');
  const [emailChange, setEmailChange] = useState({ new_email: '', password: '', request_id: '', code: '' });
  const [promotion, setPromotion] = useState(blank);
  const [staff, setStaff] = useState({ staff_id: '', staff_name: '', attendance_date: new Date().toISOString().slice(0,10), status: 'Present', arrival_time: '' });
  const [topic, setTopic] = useState({ subject_id: '', class_key: '', session_id: '', term_id: '', title: '', notes: '' });
  const [timetable, setTimetable] = useState({ session_id: '', term_id: '', class_key: '', subject_id: '', teacher_id: '', room: '', weekday: '1', period: '' });
  const [book, setBook] = useState({ title: '', author: '', category: '', isbn: '', copies: 1 });
  const [loan, setLoan] = useState({ book_id: '', borrower_id: '', borrower_name: '', due_at: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [s,p,a,b,l,r,sr,te,st,ca] = await Promise.all([
      call('/api/academic/sessions'), call(`${API}/promotions`), call(`${API}/staff-attendance`), call(`${API}/library/books`), call(`${API}/library/loans`), call(`${API}/result-reviews`), call('/api/optional-subject-change-requests'), call(`${API}/timetable`), call('/api/entities/Student?limit=2000'), call('/api/entities/ClassArm?limit=500'),
    ]);
    setSessions(s); setPromotions(p); setAttendance(a); setBooks(b); setLoans(l); setReviews(r); setSubjectRequests(sr); setTimetableEntries(te); setStudents(st); setClassArms(ca);
    const active = s.find(x => x.terms?.some(t => t.is_active));
    if (active) { const term = active.terms.find(t => t.is_active); setPromotion(v => ({...v, session_id: v.session_id || active.id})); setTopic(v => ({...v, session_id: v.session_id || active.id, term_id: v.term_id || term.id})); setTimetable(v => ({...v, session_id: v.session_id || active.id, term_id: v.term_id || term.id})); }
  };
  useEffect(() => { refresh().catch(e => setMessage(e.message)); }, []);
  const submit = async (path, body, reset) => { setBusy(true); setMessage(''); try { await call(path,'POST',body); if (reset) reset(); await refresh(); setMessage('Saved successfully.'); } catch(e) { setMessage(e.message); } finally { setBusy(false); } };
  const activeTerms = sessions.flatMap(s => (s.terms || []).map(t => ({...t, sessionName:s.name})));
  return <AppShell role="admin"><PageHeader title="School workflows" description="Operational records and approval-related workflows. Existing school settings remain the source for academic sessions and terms." />
    {message && <div role="status" className="surface mb-4 p-3 text-sm">{message}</div>}
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="surface space-y-3 p-5"><h2 className="font-semibold">Promotion history</h2><p className="text-xs text-muted-foreground">Create actual promotion records; history is not inferred from a student's current class.</p><div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-xs"><span>Student</span><select className="h-10 w-full rounded-md border bg-background px-2" value={promotion.student_id} onChange={e=>{const student=students.find(x=>x.id===e.target.value);setPromotion(v=>({...v,student_id:e.target.value,student_name:student?.full_name||'',admission_number:student?.admission_no||'',from_class:student?.class_arm_name||student?.class_arm_id||student?.level||''}));}}><option value="">Choose student</option>{students.map(x=><option key={x.id} value={x.id}>{x.full_name} · {x.admission_no||x.id}</option>)}</select></label><label className="space-y-1 text-xs"><span>Previous class/arm</span><Input value={promotion.from_class} readOnly /></label><label className="space-y-1 text-xs"><span>New class/arm</span><select className="h-10 w-full rounded-md border bg-background px-2" value={promotion.to_class} onChange={e=>setPromotion(v=>({...v,to_class:e.target.value}))}><option value="">Choose destination</option>{classArms.filter(x=>x.active!==false).map(x=><option key={x.id} value={x.id}>{x.display_name}</option>)}</select></label><label className="space-y-1 text-xs"><span>Promotion date</span><Input type="date" value={promotion.promotion_date} onChange={e=>setPromotion(v=>({...v,promotion_date:e.target.value}))}/></label></div><label className="block space-y-1 text-xs">Academic session<select className="h-10 w-full rounded-md border bg-background px-3" value={promotion.session_id} onChange={e=>setPromotion(v=>({...v,session_id:e.target.value}))}><option value="">Choose session</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!promotion.admin_track_change_authorised} onChange={e=>setPromotion(v=>({...v,admin_track_change_authorised:e.target.checked}))}/> Admin authorises an SS2→SS3 track change</label><Button disabled={busy} onClick={()=>submit(`${API}/promotions`,promotion,()=>setPromotion(blank))}>Record promotion</Button><p className="text-xs text-muted-foreground">{promotions.length} historical records</p></section>
      <section className="surface space-y-3 p-5"><h2 className="font-semibold">Library catalogue</h2><div className="grid grid-cols-2 gap-2">{[['title','Title'],['author','Author'],['category','Category'],['isbn','ISBN'],['copies','Copies']].map(([k,l])=><label key={k} className="space-y-1 text-xs"><span>{l}</span><Input type={k==='copies'?'number':'text'} value={book[k]} onChange={e=>setBook(v=>({...v,[k]:e.target.value}))}/></label>)}</div><Button disabled={busy} onClick={()=>submit(`${API}/library/books`,{...book,copies:Number(book.copies)},()=>setBook({title:'',author:'',category:'',isbn:'',copies:1}))}>Register book</Button><p className="text-xs text-muted-foreground">{books.length} books in catalogue</p></section>
      <section className="surface space-y-3 p-5"><h2 className="font-semibold">Optional-subject change requests</h2><p className="text-xs text-muted-foreground">Admin oversight for student requests. The original selection remains active until approval.</p>{subjectRequests.length ? subjectRequests.map(r=><div key={r.id} className="border-t py-2 text-xs"><p>{r.class_key} · Student {r.student_id}</p><p className="text-muted-foreground">{r.reason}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>submit(`/api/optional-subject-change-requests/${r.id}/decision`,{decision:'approved',note:'Admin oversight approval'})}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>submit(`/api/optional-subject-change-requests/${r.id}/decision`,{decision:'rejected',note:'Admin oversight rejection'})}>Reject</Button></div></div>) : <p className="text-xs text-muted-foreground">No pending subject-change requests.</p>}</section>
      <section className="surface space-y-3 p-5"><h2 className="font-semibold">Account recovery link</h2><p className="text-xs text-muted-foreground">Generate a single-use, expiring recovery link for an existing account. Share it only with the intended account holder.</p><label className="block space-y-1 text-xs">Target account ID<Input value={recovery.user_id} onChange={e=>setRecovery({user_id:e.target.value})}/></label><Button disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{const r=await call('/api/account/recovery-links','POST',recovery);setRecoveryUrl(r.recovery_url);setMessage(`Link expires ${r.expires_at}`);}catch(e){setMessage(e.message);}finally{setBusy(false);}}}>Generate recovery link</Button>{recoveryUrl&&<div className="break-all rounded border p-2 text-xs">{recoveryUrl}</div>}</section>
      <section className="surface space-y-3 p-5"><h2 className="font-semibold">Admin email change</h2><p className="text-xs text-muted-foreground">Requires current password and verification delivered to the new email.</p><Input placeholder="New email" value={emailChange.new_email} onChange={e=>setEmailChange(v=>({...v,new_email:e.target.value}))}/><Input type="password" placeholder="Current password" value={emailChange.password} onChange={e=>setEmailChange(v=>({...v,password:e.target.value}))}/><Button disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{const r=await call('/api/admin/email-change/request','POST',emailChange);setEmailChange(v=>({...v,request_id:r.request_id}));setMessage('Verification code sent to the new email.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}}>Send verification code</Button><div className="flex gap-2"><Input placeholder="6-digit code" value={emailChange.code} onChange={e=>setEmailChange(v=>({...v,code:e.target.value}))}/><Button disabled={busy||!emailChange.request_id} onClick={()=>submit('/api/admin/email-change/verify',{request_id:emailChange.request_id,code:emailChange.code})}>Verify</Button></div></section>
    </div>
  </AppShell>;
}
