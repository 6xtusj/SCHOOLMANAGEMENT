import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const blank = { headline: '', tagline: '', about: '', admissions_open: false, admission_date: '', admission_time: '', admission_venue: '', admissions_available: false, admission_message: '', admission_instructions: '', hero_image: '', gallery: [] };

export default function PublicSiteEditor() {
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const response = await fetch('/api/public/site');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load the public school website.');
    setForm({ ...blank, ...data, gallery: data.gallery || [] });
  };
  useEffect(() => { load().catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const upload = async (file) => {
    if (!file) return '';
    const body = new FormData(); body.append('file', file);
    const response = await fetch('/api/admin/public-site/images', { method: 'POST', credentials: 'include', body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not upload the school image.');
    return data.file_uri;
  };
  const uploadHero = async (event) => {
    setError(''); setMessage('');
    try { set('hero_image', await upload(event.target.files?.[0])); }
    catch (e) { setError(e.message); }
    finally { event.target.value = ''; }
  };
  const uploadGallery = async (event) => {
    const files = Array.from(event.target.files || []);
    setError(''); setMessage('');
    try {
      const newImages = await Promise.all(files.map(upload));
      setForm((current) => ({ ...current, gallery: [...current.gallery, ...newImages].slice(0, 8) }));
    } catch (e) { setError(e.message); }
    finally { event.target.value = ''; }
  };
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/public-site', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the school homepage.');
      setForm({ ...blank, ...data, gallery: data.gallery || [] });
      setMessage('Public school homepage saved.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return <section className="surface space-y-4 p-5">
    <div><h2 className="font-heading text-lg font-semibold">Public school homepage</h2><p className="mt-1 text-sm text-muted-foreground">Edit the information families see before logging in. School identity and contacts come from the School Settings above.</p></div>
    {loading ? <p className="text-sm text-muted-foreground">Loading website content…</p> : <>
      <Field label="Main headline"><Input maxLength={140} value={form.headline} onChange={(e) => set('headline', e.target.value)} /></Field>
      <Field label="Short introduction"><Input maxLength={280} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
      <Field label="About the school"><Textarea rows={5} maxLength={5000} value={form.about} onChange={(e) => set('about', e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Hero photograph (JPG, PNG or WebP)"><Input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={uploadHero} />{form.hero_image && <div className="mt-2 flex items-center gap-2"><img src={form.hero_image} alt="Hero preview" className="h-16 w-24 rounded object-cover" /><Button variant="outline" size="sm" onClick={() => set('hero_image', '')}>Remove</Button></div>}</Field>
        <Field label="Gallery photos (up to 8)"><Input type="file" multiple accept=".jpg,.jpeg,.png,.webp" disabled={form.gallery.length >= 8} onChange={uploadGallery} /><div className="mt-2 flex flex-wrap gap-2">{form.gallery.map((image) => <div key={image} className="relative"><img src={image} alt="" className="h-16 w-20 rounded object-cover" /><button type="button" className="absolute -right-2 -top-2 rounded-full bg-destructive px-2 text-xs text-white" aria-label="Remove photo" onClick={() => set('gallery', form.gallery.filter((item) => item !== image))}>×</button></div>)}</div></Field></div>
      <Field label="Admission announcement"><Input maxLength={500} value={form.admission_message} onChange={(e) => set('admission_message', e.target.value)} /></Field>
      <Field label="Examination request instructions"><Textarea rows={3} maxLength={2000} value={form.admission_instructions} onChange={(e) => set('admission_instructions', e.target.value)} /></Field>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-heading text-sm font-semibold">Entrance examination schedule</h3>
        <p className="mt-1 text-xs text-muted-foreground">This schedule appears on the public homepage and on new applicants' printable examination letters. To change an existing applicant's appointment and notify their guardian, update that applicant in Admin → Admissions.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Admission / examination date"><Input type="date" value={form.admission_date} onChange={(e) => set('admission_date', e.target.value)} /></Field>
          <Field label="Start time"><Input type="time" value={form.admission_time} onChange={(e) => set('admission_time', e.target.value)} /></Field>
          <Field label="Venue / place"><Input maxLength={200} value={form.admission_venue} onChange={(e) => set('admission_venue', e.target.value)} placeholder="School examination hall" /></Field>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.admissions_open} onChange={(e) => set('admissions_open', e.target.checked)} /> Accept new admission applications</label>
      {!form.admissions_available && <p className="text-xs text-warning">Applications are not currently available publicly. Set all three schedule details and enable admissions before saving.</p>}
      <p className="text-xs text-muted-foreground">Parents receive the examination schedule by email after submitting only when SMTP email is configured. This local app does not send an automatic reminder on exam day.</p>
      <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save public homepage'}</Button>
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>}
  </section>;
}

function Field({ label, children }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
