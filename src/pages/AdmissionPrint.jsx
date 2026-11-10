import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CalendarDays, Clock3, MapPin, Printer } from 'lucide-react';

export default function AdmissionPrint() {
  const [params] = useSearchParams();
  const emailSent = params.get('email_sent');
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setError('This print link is incomplete.'); return; }
    fetch(`/api/admissions/slip?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the examination request.');
        setSlip(data);
      }).catch((requestError) => setError(requestError.message));
  }, [params]);

  if (error) return <main className="mx-auto max-w-2xl space-y-4 p-8"><p role="alert">{error}</p><Button asChild variant="outline"><Link to="/admissions">Return to admission form</Link></Button></main>;
  if (!slip) return <main className="p-8 text-sm">Loading admission request…</main>;
  const applicant = slip.application;
  return <main className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-indigo-50 px-4 py-8 dark:from-background dark:via-background dark:to-slate-900 print:bg-white print:p-0">
    <div className="mx-auto max-w-3xl space-y-5">
    {emailSent === '1' && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 print:hidden">A schedule confirmation email was sent to the parent / guardian address on the application.</p>}
    {emailSent === '0' && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 print:hidden">Email was not sent. Print or save this letter and share the examination details with the parent / guardian. Configure a school email provider in Admin → School Settings to enable email.</p>}
    <div className="flex justify-end gap-2 print:hidden"><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print examination letter</Button><Button asChild variant="outline"><Link to="/">School home</Link></Button></div>
    <article className="overflow-hidden rounded-2xl border-2 border-blue-900 bg-white shadow-xl dark:bg-card print:rounded-none print:border-2 print:border-black print:shadow-none">
      <header className="bg-gradient-to-r from-blue-950 via-blue-800 to-cyan-700 px-6 py-7 text-white print:bg-blue-900">
        <Link to="/" className="mx-auto flex w-fit items-center justify-center gap-3 rounded-lg text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white print:text-black">
          {slip.school_logo && <img src={slip.school_logo} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />}
          <span><span className="block font-heading text-xl font-bold">{slip.school_name || 'School'}</span><span className="mt-1 block text-xs text-cyan-100 print:text-black">Admission and examination office</span></span>
        </Link>
        {(slip.school_address || slip.school_phone || slip.school_email) && <p className="mt-3 text-center text-xs text-blue-100 print:text-black">{[slip.school_address, slip.school_phone, slip.school_email].filter(Boolean).join(' · ')}</p>}
        <div className="mt-5 border-t border-white/25 pt-4 text-center"><h1 className="font-heading text-xl font-bold tracking-wide sm:text-2xl">ADMISSION EXAMINATION LETTER</h1><p className="mt-2 text-sm text-cyan-100 print:text-black">Application reference: <strong className="text-white print:text-black">{slip.reference}</strong></p></div>
      </header>
      <div className="p-6 sm:p-8">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-200">Applicant details</p><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <p><strong>Student:</strong> {applicant.student_name}</p><p><strong>Date of birth:</strong> {applicant.date_of_birth}</p>
        <p><strong>Gender:</strong> {applicant.gender}</p><p><strong>Class requested:</strong> {applicant.requested_level}{applicant.requested_track ? ` · ${applicant.requested_track}` : ''}</p>
        <p><strong>Parent / guardian:</strong> {applicant.guardian_name}</p><p><strong>Contact:</strong> {applicant.guardian_phone} · {applicant.guardian_email}</p>
      </div>
      </div>
      <section className="mt-6 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-5 dark:bg-emerald-950/25 print:bg-white">
        <h2 className="font-heading text-lg font-bold text-emerald-950 dark:text-emerald-100 print:text-black">Entrance examination appointment</h2>
        {slip.exam_date && slip.exam_time && slip.exam_venue ? <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Appointment icon={CalendarDays} label="Date" value={new Date(`${slip.exam_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
          <Appointment icon={Clock3} label="Time" value={slip.exam_time} />
          <Appointment icon={MapPin} label="Place" value={slip.exam_venue} />
        </div> : <p className="mt-2 text-sm">The school will confirm the examination date, time and venue with the parent or guardian.</p>}
        {slip.admission_instructions && <p className="mt-4 border-t border-emerald-200 pt-3 text-sm text-emerald-950 dark:text-emerald-100 print:text-black">{slip.admission_instructions}</p>}
      </section>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 print:bg-white print:text-black"><p className="font-semibold">Please bring this printed letter to the school.</p><p className="mt-1 text-xs">Keep the application reference for enquiries. This letter confirms an examination application; it is not an admission offer.</p></div>
      <div className="mt-8 grid grid-cols-2 gap-8 pt-3 text-xs text-muted-foreground print:text-black"><p className="border-t border-slate-400 pt-2">Parent / guardian signature</p><p className="border-t border-slate-400 pt-2 text-right">School officer</p></div>
      <p className="mt-6 text-center text-[11px] text-muted-foreground print:text-black">Generated by {slip.school_name || 'the school'} admission portal.</p>
      </div>
    </article>
    </div>
    <style>{'@media print { @page { size: A4; margin: 14mm; } body { background: white !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }'}</style>
  </main>;
}

function Appointment({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800 dark:text-emerald-300 print:text-black" /><div><p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 print:text-black">{label}</p><p className="mt-1 text-sm font-bold text-emerald-950 dark:text-emerald-100 print:text-black">{value}</p></div></div>;
}
