import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock3, MapPin, Printer, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emptyForm = { student_name: '', date_of_birth: '', gender: '', requested_level: '', requested_track: '', guardian_name: '', guardian_phone: '', guardian_email: '', address: '', previous_school: '', previous_class: '' };
const normalized = (value) => String(value || '').replace(/\s+/g, '').toLowerCase();

export default function AdmissionPortal() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [site, setSite] = useState(null);
  const [arms, setArms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const levels = useMemo(() => [...new Set(arms.map((arm) => arm.level).filter(Boolean))], [arms]);
  const tracks = useMemo(() => [...new Set(arms.filter((arm) => normalized(arm.level) === normalized(form.requested_level)).map((arm) => arm.track).filter(Boolean))], [arms, form.requested_level]);

  useEffect(() => {
    Promise.all([
      fetch('/api/public/site').then((r) => r.json()),
      fetch('/api/public/admission-options').then((r) => r.json()),
    ]).then(([content, options]) => {
      setSite(content);
      setArms(Array.isArray(options) ? options : []);
    }).catch((e) => setError(e.message || 'Admission information is unavailable.'));
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Application could not be submitted.');
      navigate(`/admissions/print?token=${encodeURIComponent(data.print_token)}&email_sent=${data.email_sent ? '1' : '0'}`);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 dark:from-background dark:via-background dark:to-slate-900">
    <header className="border-b border-sky-100 bg-white/90 shadow-sm backdrop-blur dark:bg-card"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
      <Link to="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {site?.school_logo && <img src={site.school_logo} alt="" className="h-11 w-11 rounded-lg border bg-white object-contain p-1" />}
        <span className="min-w-0"><span className="block truncate font-heading text-sm font-bold text-foreground">{site?.school_name || 'School home'}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="h-3 w-3" /> Return to school homepage</span></span>
      </Link>
      <Button asChild variant="outline"><Link to="/login">Portal login</Link></Button>
    </div></header>
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-12">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-blue-800 to-cyan-700 p-6 text-white shadow-lg sm:p-9">
        <div className="flex items-start gap-4"><div className="hidden rounded-xl bg-white/15 p-3 sm:block"><ShieldCheck className="h-8 w-8 text-cyan-200" /></div><div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{site?.school_name || 'School admissions'}</p>
          <h1 className="mt-2 font-heading text-3xl font-bold sm:text-4xl">Entrance examination application</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50">{site?.admission_message || 'Complete this form to request admission. Your examination schedule will be shown on the printable request.'}</p>
          {site?.admission_instructions && <p className="mt-3 max-w-3xl text-sm text-cyan-100">{site.admission_instructions}</p>}
        </div></div>
        {site?.admission_date && site?.admission_time && site?.admission_venue && <div className="mt-6 grid gap-3 rounded-xl border border-white/20 bg-white/10 p-4 sm:grid-cols-3">
          <ScheduleItem icon={CalendarDays} label="Examination date" value={new Date(`${site.admission_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
          <ScheduleItem icon={Clock3} label="Arrival time" value={site.admission_time} />
          <ScheduleItem icon={MapPin} label="Venue" value={site.admission_venue} />
        </div>}
      </div>
      {!site?.admissions_available && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">Online admission applications are currently closed. The school will publish the examination schedule here when applications open.</div>}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {site?.admissions_available && <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-lg dark:border-border">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-slate-50 px-6 py-4 text-xs font-medium text-slate-600 dark:bg-muted/30 dark:text-muted-foreground"><span className="text-blue-800 dark:text-blue-300">1. Student details</span><span>2. Parent / guardian</span><span>3. Print your examination request</span></div>
        <div className="space-y-7 p-6 sm:p-8">
        <section className="space-y-4"><h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">1</span>Student details</h2><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student's full name" required><Input value={form.student_name} onChange={(e) => set('student_name', e.target.value)} required maxLength={160} /></Field>
          <Field label="Date of birth" required><Input type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} required /></Field>
          <Field label="Gender" required><select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option></select></Field>
          <Field label="Class applying for" required><select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.requested_level} onChange={(e) => setForm((current) => ({ ...current, requested_level: e.target.value, requested_track: '' }))}><option value="">Select class</option>{levels.map((level) => <option key={level}>{level}</option>)}</select></Field>
          {tracks.length > 0 && <Field label="Senior class track" required><select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.requested_track} onChange={(e) => set('requested_track', e.target.value)}><option value="">Select track</option>{tracks.map((track) => <option key={track}>{track}</option>)}</select></Field>}
          <Field label="Previous school"><Input value={form.previous_school} onChange={(e) => set('previous_school', e.target.value)} maxLength={200} /></Field>
          <Field label="Previous class"><Input value={form.previous_class} onChange={(e) => set('previous_class', e.target.value)} maxLength={100} /></Field>
        </div></section>
        <section className="space-y-4"><h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-100 text-sm text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">2</span>Parent / guardian details</h2><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent or guardian full name" required><Input value={form.guardian_name} onChange={(e) => set('guardian_name', e.target.value)} required /></Field>
          <Field label="Phone number" required><Input type="tel" value={form.guardian_phone} onChange={(e) => set('guardian_phone', e.target.value)} required /></Field>
          <Field label="Email address" required><Input type="email" value={form.guardian_email} onChange={(e) => set('guardian_email', e.target.value)} required /></Field>
          <Field label="Home address" required><Input value={form.address} onChange={(e) => set('address', e.target.value)} required maxLength={500} /></Field>
        </div></section>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><p className="font-semibold">Before you submit</p><p className="mt-1 text-xs leading-5">Check the student's name and guardian email carefully. After submitting, print the examination request and bring it to the school. The schedule above will also be printed on the request.</p></div>
        <p className="text-xs text-muted-foreground">A confirmation email with the schedule is sent to the guardian only when the school email provider is configured.</p>
        <Button type="submit" size="lg" className="bg-blue-800 text-white hover:bg-blue-700" disabled={busy || !levels.length}>{busy ? 'Submitting…' : 'Submit application and print exam request'} <Printer className="ml-2 h-4 w-4" /></Button>
        </div>
      </form>}
    </div>
  </main>;
}

function ScheduleItem({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" /><div><p className="text-[11px] uppercase tracking-wider text-blue-100">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div></div>;
}

function Field({ label, required, children }) {
  return <div className="space-y-1.5"><Label>{label}{required ? ' *' : ''}</Label>{children}</div>;
}
