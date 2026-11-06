import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image } from '@/components/ui/image';
import { Loader2, Upload, UserCircle2, Mail, ShieldCheck } from 'lucide-react';

// Shared by all portal roles. Email changes are verified independently by OTP.
export default function ProfileSection({ student, profile, user, staffProfile, promotionHistory = [], onSaved }) {
  const isStudent = !!student;
  const source = student || staffProfile || profile || {};
  const [form, setForm] = useState({
    full_name: source.full_name || user?.full_name || '',
    date_of_birth: source.date_of_birth || '', gender: source.gender || '',
    nationality: source.nationality || '', phone: source.phone || '',
    address: source.address || '', photo_url: source.photo_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requestId, setRequestId] = useState('');
  const [code, setCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const canManageBankDetails = ['teacher', 'staff', 'principal', 'bursar', 'librarian'].includes(user?.role);
  const [bankDetails, setBankDetails] = useState({ bank_name: '', account_name: '', account_number: '' });
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMessage, setBankMessage] = useState('');
  const [bankError, setBankError] = useState('');
  useEffect(() => { if (!canManageBankDetails) return; fetch('/api/payroll/my-bank-details', { credentials: 'include' }).then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Could not load your payment details.'); setBankDetails(data); }).catch(error => setBankError(error.message)); }, [user?.email, user?.role]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    setForm({ full_name: source.full_name || user?.full_name || '', date_of_birth: source.date_of_birth || '', gender: source.gender || '', nationality: source.nationality || '', phone: source.phone || '', address: source.address || '', photo_url: source.photo_url || '' });
  }, [source.id, source.full_name, source.date_of_birth, source.gender, source.nationality, source.phone, source.address, source.photo_url, user?.full_name]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const { file_url } = await base44.integrations.Core.UploadPublicFile({ file }); set('photo_url', file_url); }
    finally { setUploading(false); event.target.value = ''; }
  };

  const save = async () => {
    setSaving(true); setSaved(false); setEmailError('');
    try {
      if (isStudent) {
        await base44.entities.Student.update(student.id, { full_name: form.full_name, date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined, nationality: form.nationality, phone: form.phone, address: form.address, photo_url: form.photo_url });
      } else {
        // Empty enum/date fields are stored as NULL, not empty strings; the API validates enums.
        const cleanForm = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === '' ? null : value]));
        const payload = { ...cleanForm, email: user?.email, full_name: form.full_name };
        if (staffProfile?.id) await base44.entities.StaffProfile.update(staffProfile.id, payload);
        else if (profile?.id) await base44.entities.PortalProfile.update(profile.id, payload);
        else await base44.entities.PortalProfile.create(payload);
      }
      if (form.full_name && form.full_name !== user?.full_name) await base44.auth.updateMe({ full_name: form.full_name });
      setSaved(true); onSaved?.();
    } catch (error) { setEmailError(error.message || 'Could not save profile changes.'); }
    finally { setSaving(false); }
  };

  const requestEmailChange = async () => {
    setEmailBusy(true); setEmailError(''); setEmailMessage('');
    try {
      const response = await fetch('/api/account/email-change/request', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_email: newEmail, password }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not send verification code.');
      setRequestId(result.request_id); setEmailMessage(`Verification code sent to ${newEmail}. It expires in 15 minutes.`);
    } catch (error) { setEmailError(error.message); }
    finally { setEmailBusy(false); }
  };

  const saveBankDetails = async () => {
    setBankBusy(true); setBankMessage(''); setBankError('');
    try { const response = await fetch('/api/payroll/my-bank-details', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bankDetails) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Could not save payment details.'); setBankMessage(data.message || 'Payment details saved securely.'); } catch (error) { setBankError(error.message); } finally { setBankBusy(false); }
  };

  const verifyEmailChange = async () => {
    setEmailBusy(true); setEmailError(''); setEmailMessage('');
    try {
      const response = await fetch('/api/account/email-change/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId, code }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Email verification failed.');
      setEmailMessage('Email changed successfully. Reloading your account…');
      window.location.reload();
    } catch (error) { setEmailError(error.message); }
    finally { setEmailBusy(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <div className="surface h-fit p-5 text-center">
        <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border border-border bg-muted">
          {form.photo_url ? <Image src={form.photo_url} alt={form.full_name} className="h-full w-full" fittingType="fill" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><UserCircle2 className="h-10 w-10" /></div>}
        </div>
        <label className="mt-3 inline-block"><input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} /><Button asChild variant="outline" size="sm" className="gap-2" disabled={uploading}><span>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Change photo</span></Button></label>
        <p className="mt-2 text-[11px] text-muted-foreground">JPG or PNG, square works best.</p>
      </div>
      <div className="space-y-4">
        <section className="surface space-y-4 p-5">
          <h2 className="text-sm font-semibold">Personal details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={isStudent ? 'Full name' : 'Your name'} value={form.full_name} onChange={(v) => set('full_name', v)} />
            <Field label="Phone number" value={form.phone} onChange={(v) => set('phone', v)} placeholder="0803 000 0000" />
            <Field label="Date of birth" type="date" value={form.date_of_birth} onChange={(v) => set('date_of_birth', v)} />
            <Field label="Nationality" value={form.nationality} onChange={(v) => set('nationality', v)} placeholder="Nigerian" />
            <div className="space-y-1.5"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Gender</Label><Select value={form.gender || 'unset'} onValueChange={(v) => set('gender', v === 'unset' ? '' : v)}><SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger><SelectContent><SelectItem value="unset">Not set</SelectItem><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent></Select></div>
            <Field label="Address" value={form.address} onChange={(v) => set('address', v)} placeholder="House, street, town" />
          </div>
          {isStudent && <div className="space-y-3 rounded-lg bg-muted/50 p-4"><h3 className="text-sm font-semibold">School record</h3><div className="grid gap-2 text-xs sm:grid-cols-2"><p>Admission number: {student.admission_no || '—'}</p><p>Current class: {student.class_arm_name || student.level || '—'}</p><p>Track: {student.track || '—'}</p><p>Guardian: {student.guardian_name || '—'}</p><p>Guardian phone: {student.guardian_phone || '—'}</p><p>Guardian email: {student.guardian_email || '—'}</p></div><p className="text-[11px] text-muted-foreground">Class, admission number and guardian details are managed by the school office.</p></div>}
          {isStudent && promotionHistory.length > 0 && <section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Previous classes and promotion history</h3>{promotionHistory.map((record) => <div key={record.id} className="text-xs"><p>{record.from_class || 'New admission'} → {record.to_class}</p><p className="text-muted-foreground">{record.session_id} · {record.promotion_date}</p></div>)}</section>}
          <div className="flex items-center gap-3"><Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes</Button>{saved && <span className="text-xs text-success">Profile updated</span>}</div>
        </section>
        <section className="surface space-y-3 p-5">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Login email address</h2></div>
          <p className="text-xs text-muted-foreground">Current email: <strong className="text-foreground">{user?.email || 'Unavailable'}</strong>. Changing it requires your current password and a verification code sent to the new address.</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="New email address" value={newEmail} onChange={setNewEmail} type="email" /><Field label="Current password" value={password} onChange={setPassword} type="password" /></div>
          <Button variant="outline" size="sm" onClick={requestEmailChange} disabled={emailBusy || !newEmail.trim() || !password}>{emailBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send verification code</Button>
          {requestId && <div className="flex flex-wrap items-end gap-2"><div className="min-w-[180px] flex-1"><Field label="Verification code" value={code} onChange={setCode} placeholder="6-digit code" /></div><Button size="sm" onClick={verifyEmailChange} disabled={emailBusy || code.trim().length < 6}><ShieldCheck className="mr-2 h-4 w-4" /> Verify and change email</Button></div>}
          {emailMessage && <p role="status" className="text-xs text-success">{emailMessage}</p>}{emailError && <p role="alert" className="text-xs text-destructive">{emailError}</p>}
        </section>
        {canManageBankDetails && <section className="surface space-y-3 p-5"><div><h2 className="text-sm font-semibold">My payment details</h2><p className="text-xs text-muted-foreground">These bank details are encrypted and visible to you and the bursary only. The bursary may use them for salary and other authorised staff payments.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Bank name" value={bankDetails.bank_name} onChange={v => setBankDetails(x => ({ ...x, bank_name: v }))} placeholder="Bank name"/><Field label="Account name" value={bankDetails.account_name} onChange={v => setBankDetails(x => ({ ...x, account_name: v }))} placeholder="Name on bank account"/><Field label="10-digit account number" value={bankDetails.account_number} onChange={v => setBankDetails(x => ({ ...x, account_number: v.replace(/\D/g, '').slice(0, 10) }))} placeholder="0123456789"/></div><Button size="sm" variant="outline" onClick={saveBankDetails} disabled={bankBusy || !bankDetails.bank_name.trim() || !bankDetails.account_name.trim() || !/^\d{10}$/.test(bankDetails.account_number)}>{bankBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save payment details</Button>{bankMessage && <p role="status" className="text-xs text-success">{bankMessage}</p>}{bankError && <p role="alert" className="text-xs text-destructive">{bankError}</p>}</section>}
      </div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, type = 'text' }) { return <div className="space-y-1.5"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label><Input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>; }
