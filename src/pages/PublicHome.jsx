import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Clock3, GraduationCap, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

const initialSite = {
  school_name: 'Our School',
  headline: 'A place to learn, grow and lead',
  tagline: 'Building confident learners and responsible citizens.',
  about: 'Welcome to our school. We provide a supportive environment where every learner can develop knowledge, character and practical skills.',
  admissions_open: false,
  admissions_available: false,
  admission_date: '',
  admission_time: '',
  admission_venue: '',
  admission_message: '',
  hero_image: '',
  gallery: [],
};

export default function PublicHome() {
  const [site, setSite] = useState(initialSite);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/public/site')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'School information is unavailable.');
        setSite({ ...initialSite, ...data });
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <Link to="/" aria-label={`${site.school_name} homepage`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:gap-3">
            {site.school_logo && <img src={site.school_logo} alt="" className="h-11 w-11 rounded-md object-contain" />}
            <div className="min-w-0"><p className="truncate font-heading text-base font-bold sm:text-lg">{site.school_name}</p>{site.motto && <p className="hidden truncate text-xs text-muted-foreground sm:block">{site.motto}</p>}</div>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            {site.admissions_available && <>
              <Button asChild variant="outline" size="icon" className="sm:hidden">
                <Link to="/admissions" aria-label="Admissions"><GraduationCap className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="hidden sm:inline-flex"><Link to="/admissions">Admissions</Link></Button>
            </>}
            <Button asChild size="sm" className="h-10 px-3 sm:h-9"><Link to="/login">Portal login</Link></Button>
          </nav>
        </div>
      </header>

      {error && <p role="status" className="mx-auto max-w-7xl px-4 py-2 text-sm text-destructive">{error}</p>}
      <section className="relative isolate overflow-hidden bg-slate-950 text-white">
        {site.hero_image && <img src={site.hero_image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />}
        <div className="mx-auto grid min-h-[440px] max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">{site.school_name}</p>
            <h1 className="max-w-3xl font-heading text-4xl font-bold leading-tight sm:text-6xl">{site.headline}</h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-200">{site.tagline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {site.admissions_available && <Button asChild size="lg"><Link to="/admissions">Apply for admission <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
              <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20"><Link to="/login">Student and parent portal</Link></Button>
            </div>
            {site.admissions_available && site.admission_message && <p className="mt-4 text-sm text-emerald-100">{site.admission_message}</p>}
          </div>
          <div className="hidden rounded-2xl border border-white/20 bg-white/10 p-8 backdrop-blur-sm lg:block">
            <GraduationCap className="h-12 w-12 text-emerald-300" />
            <h2 className="mt-5 font-heading text-2xl font-semibold">Learning with purpose</h2>
            <p className="mt-3 leading-7 text-slate-200">{site.about}</p>
          </div>
        </div>
      </section>

      {site.admissions_available && <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-6 shadow-sm dark:border-sky-900 dark:from-blue-950/40 dark:to-cyan-950/30 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">Admissions are open</p><h2 className="mt-2 font-heading text-2xl font-bold">Entrance examination schedule</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Applicants should arrive at the venue at the scheduled time and bring their printed examination request.</p></div>
            <Button asChild><Link to="/admissions">Apply now <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <AdmissionDetail icon={CalendarDays} label="Date" value={new Date(`${site.admission_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
            <AdmissionDetail icon={Clock3} label="Time" value={site.admission_time} />
            <AdmissionDetail icon={MapPin} label="Place" value={site.admission_venue} />
          </div>
        </div>
      </section>}

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">About our school</p><h2 className="mt-3 font-heading text-3xl font-bold">A community for every learner</h2><p className="mt-5 whitespace-pre-line leading-8 text-muted-foreground">{site.about}</p></div>
        <div className="surface p-6">
          <BookOpen className="h-8 w-8 text-primary" /><h2 className="mt-4 font-heading text-xl font-semibold">Visit or contact us</h2>
          {site.address && <p className="mt-3 flex gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{site.address}</p>}
          {site.phone && <p className="mt-2 flex gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4 shrink-0" />{site.phone}</p>}
          {site.email && <p className="mt-2 text-sm text-muted-foreground">{site.email}</p>}
          {site.admissions_available && <Button asChild className="mt-6"><Link to="/admissions">Start an application</Link></Button>}
        </div>
      </section>
      {!!site.gallery?.length && <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"><h2 className="mb-5 font-heading text-2xl font-semibold">Life at {site.school_name}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{site.gallery.map((image, index) => <img key={image} src={image} alt={`School life ${index + 1}`} className="h-56 w-full rounded-xl object-cover" />)}</div></section>}
      <footer className="border-t bg-card px-4 py-6 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} {site.school_name}</footer>
    </main>
  );
}

function AdmissionDetail({ icon: Icon, label, value }) {
  return <div className="flex items-start gap-3 rounded-xl border border-white bg-white/80 p-4 dark:border-border dark:bg-card/80"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" /><div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div></div>;
}
