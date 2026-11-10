import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { items, TERMS } from '@/lib/school';
import { refreshSchoolSettings } from '@/lib/schoolSettings';
import { Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicSiteEditor from '@/components/admin/PublicSiteEditor';

const blank = {
  school_name: '', school_initials: '', school_logo: '', motto: '', address: '', phone: '', email: '',
  session: '2026/2027', term: 'First Term',
  session_start_date: '', session_end_date: '', term_start_date: '', term_end_date: '', term_resumption_date: '', exam_start_date: '', exam_end_date: '', term_closing_date: '', midterm_breaks: '', holidays: '',
  public_base_url: '',
  ca_weight: 40, assignment_weight: 10, test_weight: 10, exam_weight: 40, pass_mark: 40,
  salary_payment_day: 25,
};

export default function AdminSettings() {
  const [form, setForm] = useState(blank);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [emailDeliveries, setEmailDeliveries] = useState([]);
  const [emailLogsError, setEmailLogsError] = useState('');
  const [emailSettings, setEmailSettings] = useState({
    provider: 'brevo', sender_email: '', smtp_host: '', smtp_port: 587, smtp_tls: true,
    smtp_ssl: false, smtp_user: '', gmail_client_id: '',
  });
  const [emailSecrets, setEmailSecrets] = useState({
    smtp_password: '', brevo_api_key: '', resend_api_key: '',
    gmail_client_secret: '', gmail_refresh_token: '',
  });
  const [emailSecretStatus, setEmailSecretStatus] = useState({
    smtp_password: false, brevo_api_key: false, resend_api_key: false,
    gmail_client_secret: false, gmail_refresh_token: false,
  });
  const [clearEmailSecrets, setClearEmailSecrets] = useState([]);
  const [emailSettingsSaving, setEmailSettingsSaving] = useState(false);
  const [emailSettingsSaved, setEmailSettingsSaved] = useState(false);
  const [emailSettingsError, setEmailSettingsError] = useState('');

  const loadEmailDeliveries = useCallback(async () => {
    const response = await fetch('/api/admin/email-deliveries');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load email delivery history.');
    setEmailDeliveries(data);
    setEmailLogsError('');
  }, []);

  useEffect(() => {
    (async () => {
      const res = await base44.entities.SchoolSettings.list({ limit: 1 });
      const record = items(res)[0];
      if (record) {
        setRecordId(record.id);
        setForm({ ...blank, ...record });
        setTestRecipient(record.email || '');
      }
      try {
        const response = await fetch('/api/admin/email-settings');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load email settings.');
        setEmailSettings((current) => ({ ...current, ...data }));
        setEmailSecretStatus({
          smtp_password: data.has_smtp_password,
          brevo_api_key: data.has_brevo_api_key,
          resend_api_key: data.has_resend_api_key,
          gmail_client_secret: data.has_gmail_client_secret,
          gmail_refresh_token: data.has_gmail_refresh_token,
        });
      } catch (error) {
        setEmailSettingsError(error.message || 'Could not load email settings.');
      }
      setLoaded(true);
      try {
        await loadEmailDeliveries();
      } catch (error) {
        setEmailLogsError(error.message || 'Could not load email delivery history.');
      }
    })();
  }, [loadEmailDeliveries]);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [key]: ['ca_weight', 'assignment_weight', 'test_weight', 'exam_weight', 'pass_mark', 'salary_payment_day'].includes(key) ? Number(value) || 0 : value }));
    setSaved(false);
  };

  const setEmailField = (key) => (event) => {
    const value = event?.target ? event.target.value : event;
    setEmailSettings((current) => ({ ...current, [key]: value }));
    setEmailSettingsSaved(false);
  };

  const setEmailSecret = (key) => (event) => {
    setEmailSecrets((current) => ({ ...current, [key]: event.target.value }));
    setClearEmailSecrets((current) => current.filter((field) => field !== key));
    setEmailSettingsSaved(false);
  };

  const toggleClearEmailSecret = (key) => {
    setClearEmailSecrets((current) => current.includes(key)
      ? current.filter((field) => field !== key)
      : [...current, key]);
    setEmailSecrets((current) => ({ ...current, [key]: '' }));
    setEmailSettingsSaved(false);
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Choose an image file for the school logo.');
      event.target.value = '';
      return;
    }
    setLogoUploading(true);
    try {
      const uploaded = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((current) => ({ ...current, school_logo: uploaded.file_uri }));
      setSaved(false);
    } catch (error) {
      window.alert(error.message || 'The school logo could not be uploaded.');
    } finally {
      setLogoUploading(false);
      event.target.value = '';
    }
  };

  const total = Number(form.ca_weight) + Number(form.assignment_weight) + Number(form.test_weight) + Number(form.exam_weight);

  const save = async () => {
    if (!loaded) return;
    if (form.public_base_url) {
      try {
        const parsed = new URL(form.public_base_url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error();
      } catch {
        window.alert('Enter a public application origin such as https://school.example.com, with no path.');
        return;
      }
    }
    if (Number(form.salary_payment_day) < 1 || Number(form.salary_payment_day) > 28) { window.alert('Monthly salary request day must be between 1 and 28.'); return; }
    if (form.session_start_date && form.session_end_date && form.session_end_date < form.session_start_date) { window.alert('Session end date cannot be before the session start date.'); return; }
    if (form.term_start_date && form.term_end_date && form.term_end_date < form.term_start_date) { window.alert('Term end date cannot be before the term start date.'); return; }
    if (form.exam_start_date && form.exam_end_date && form.exam_end_date < form.exam_start_date) { window.alert('Examination end date cannot be before its start date.'); return; }
    const termDates = [form.term_resumption_date, form.exam_start_date, form.exam_end_date, form.term_closing_date].filter(Boolean);
    if (form.term_start_date && termDates.some((d) => d < form.term_start_date || (form.term_end_date && d > form.term_end_date))) { window.alert('Resumption, examination and closing dates must fall within the term.'); return; }
    if (form.session_start_date && form.term_start_date && (form.term_start_date < form.session_start_date || (form.session_end_date && form.term_start_date > form.session_end_date))) { window.alert('The term start date must fall within the academic session.'); return; }
    if (form.session_start_date && form.term_end_date && (form.term_end_date < form.session_start_date || (form.session_end_date && form.term_end_date > form.session_end_date))) { window.alert('The term end date must fall within the academic session.'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.school_initials.trim()) {
        payload.school_initials = payload.school_name.trim().split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 8).toUpperCase();
      }
      delete payload.id; delete payload.created_date; delete payload.updated_date; delete payload.created_by; delete payload.created_by_id;
      if (recordId) await base44.entities.SchoolSettings.update(recordId, payload);
      else {
        const created = await base44.entities.SchoolSettings.create(payload);
        setRecordId(created.id);
      }
      await refreshSchoolSettings();
      setSaved(true);
    } catch (error) {
      window.alert(error.message || 'School settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveEmailSettings = async () => {
    setEmailSettingsSaving(true);
    setEmailSettingsError('');
    setEmailSettingsSaved(false);
    try {
      const response = await fetch('/api/admin/email-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...emailSettings,
          ...Object.fromEntries(Object.entries(emailSecrets).filter(([, value]) => value)),
          clear_secrets: clearEmailSecrets,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Email settings could not be saved.');
      setEmailSecretStatus((current) => {
        const next = { ...current };
        Object.entries(emailSecrets).forEach(([key, value]) => {
          if (value) next[key] = true;
        });
        clearEmailSecrets.forEach((key) => { next[key] = false; });
        return next;
      });
      setEmailSecrets({
        smtp_password: '', brevo_api_key: '', resend_api_key: '',
        gmail_client_secret: '', gmail_refresh_token: '',
      });
      setClearEmailSecrets([]);
      setEmailSettingsSaved(true);
    } catch (error) {
      setEmailSettingsError(error.message || 'Email settings could not be saved.');
    } finally {
      setEmailSettingsSaving(false);
    }
  };

  const sendTestEmail = async () => {
    setTestSending(true);
    setTestStatus('');
    try {
      const response = await fetch('/api/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testRecipient }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Test email could not be sent.');
      setTestStatus(data.message);
      await loadEmailDeliveries();
    } catch (error) {
      setTestStatus(error.message || 'Test email could not be sent.');
      try {
        await loadEmailDeliveries();
      } catch (loadError) {
        setEmailLogsError(loadError.message || 'Could not refresh email delivery history.');
      }
    } finally {
      setTestSending(false);
    }
  };

  return (
    <AppShell role="admin">
      <PageHeader title="School settings" description="Identity, current term and how scores are weighted across the school." />

      <div className="surface mb-5 flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="text-sm font-semibold">Additional school workflows</h3><p className="text-xs text-muted-foreground">Manage promotion history and other school-wide workflows.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/admin/handover">Admin handover</Link></Button><Button asChild><Link to="/admin/workflows">Open workflow desk</Link></Button></div></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface p-5">
          <h3 className="font-heading text-sm font-semibold">School identity</h3>
          <div className="mt-4 space-y-3">
            <Field label="School name"><Input value={form.school_name || ''} onChange={set('school_name')} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="School initials (used in admission numbers)"><Input value={form.school_initials || ''} onChange={(e) => setForm((current) => ({ ...current, school_initials: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) }))} placeholder="e.g. ABC" /></Field>
              <Field label="School logo"><Input type="file" accept="image/*" disabled={logoUploading} onChange={uploadLogo} /></Field>
            </div>
            {logoUploading && <p className="text-xs text-muted-foreground">Uploading logo…</p>}
            {form.school_logo && <div className="flex items-center gap-3"><img src={form.school_logo} alt="School logo preview" className="h-14 w-14 rounded-md border object-contain p-1" /><Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, school_logo: '' }))}>Remove logo</Button></div>}
            <Field label="Motto"><Input value={form.motto || ''} onChange={set('motto')} /></Field>
            <Field label="Address"><Input value={form.address || ''} onChange={set('address')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><Input value={form.phone || ''} onChange={set('phone')} /></Field>
              <Field label="Email"><Input value={form.email || ''} onChange={set('email')} /></Field>
            </div>
          </div>
        </div>

        <div className="surface p-5">
          <h3 className="font-heading text-sm font-semibold">Academic period</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Session"><Input value={form.session || ''} onChange={set('session')} placeholder="2025/2026" /></Field>
            <Field label="Current term">
              <Select value={form.term} onValueChange={set('term')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Session start date"><Input type="date" value={form.session_start_date || ''} onChange={set('session_start_date')} /></Field>
            <Field label="Session end date"><Input type="date" value={form.session_end_date || ''} onChange={set('session_end_date')} /></Field>
            <Field label="Current term start date"><Input type="date" value={form.term_start_date || ''} onChange={set('term_start_date')} /></Field>
            <Field label="Current term end date"><Input type="date" value={form.term_end_date || ''} onChange={set('term_end_date')} /></Field>
            <Field label="Resumption date"><Input type="date" value={form.term_resumption_date || ''} onChange={set('term_resumption_date')} /></Field>
            <Field label="Examination starts"><Input type="date" value={form.exam_start_date || ''} onChange={set('exam_start_date')} /></Field>
            <Field label="Examination ends"><Input type="date" value={form.exam_end_date || ''} onChange={set('exam_end_date')} /></Field>
            <Field label="Term closing / report-card publication opens"><Input type="date" value={form.term_closing_date || ''} onChange={set('term_closing_date')} /></Field>
            <Field label="Mid-term break dates (comma-separated)"><Textarea rows={2} value={form.midterm_breaks || ''} onChange={set('midterm_breaks')} placeholder="2026-11-02 to 2026-11-06" /></Field>
            <Field label="Holiday dates (comma-separated)"><Textarea rows={2} value={form.holidays || ''} onChange={set('holidays')} placeholder="2026-12-25, 2026-12-26" /></Field>
          </div>

          <h3 className="mt-6 font-heading text-sm font-semibold">Score weights</h3>
          <p className="mt-1 text-xs text-muted-foreground">These weights define the columns on every result sheet and report card.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Continuous assessment"><Input type="number" value={form.ca_weight} onChange={set('ca_weight')} /></Field>
            <Field label="Assignments"><Input type="number" value={form.assignment_weight} onChange={set('assignment_weight')} /></Field>
            <Field label="Tests"><Input type="number" value={form.test_weight} onChange={set('test_weight')} /></Field>
            <Field label="Examination"><Input type="number" value={form.exam_weight} onChange={set('exam_weight')} /></Field>
            <Field label="Pass mark"><Input type="number" value={form.pass_mark} onChange={set('pass_mark')} /></Field>
          </div>
          <p className={`mt-2 text-xs ${total === 100 ? 'text-success' : 'text-warning'}`}>Weight total: {total} / 100</p>
        </div>
      </div>

      <div className="surface mt-5 p-5">
        <PublicSiteEditor />
      </div>

      <div className="surface mt-5 p-5">
        <h3 className="font-heading text-sm font-semibold">School email (optional)</h3>
        <p className="mt-1 text-xs text-muted-foreground">Configure your public portal address and email provider. Render Free blocks outbound SMTP, so choose Brevo, Resend, or Gmail API there. In production, use your public HTTPS domain.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Public application URL"><Input type="url" value={form.public_base_url || ''} onChange={set('public_base_url')} placeholder="https://school.example.com" /></Field>
          <Field label="Email provider">
            <Select value={emailSettings.provider} onValueChange={setEmailField('provider')}>
              <SelectTrigger><SelectValue placeholder="Choose provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brevo">Brevo API (recommended for Render Free)</SelectItem>
                <SelectItem value="resend">Resend API</SelectItem>
                <SelectItem value="gmail">Gmail API (OAuth)</SelectItem>
                <SelectItem value="smtp">SMTP (not Render Free)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sender email"><Input type="email" value={emailSettings.sender_email || ''} onChange={setEmailField('sender_email')} placeholder="school@example.com" /></Field>
          {emailSettings.provider === 'smtp' && <>
            <Field label="SMTP host"><Input value={emailSettings.smtp_host || ''} onChange={setEmailField('smtp_host')} placeholder="smtp.example.com" /></Field>
            <Field label="SMTP port"><Input type="number" value={emailSettings.smtp_port ?? 587} onChange={setEmailField('smtp_port')} /></Field>
            <Field label="SMTP username"><Input value={emailSettings.smtp_user || ''} onChange={setEmailField('smtp_user')} /></Field>
            <Field label="SMTP password"><Input type="password" value={emailSecrets.smtp_password} onChange={setEmailSecret('smtp_password')} placeholder={emailSecretStatus.smtp_password ? 'Saved; leave empty to keep it' : 'SMTP password or app password'} /></Field>
            <div className="flex items-center gap-5 pt-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!emailSettings.smtp_tls} onChange={(event) => setEmailSettings((current) => ({ ...current, smtp_tls: event.target.checked, smtp_ssl: false }))} /> TLS</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!emailSettings.smtp_ssl} onChange={(event) => setEmailSettings((current) => ({ ...current, smtp_ssl: event.target.checked, smtp_tls: false }))} /> SSL</label>
            </div>
            {emailSecretStatus.smtp_password && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearEmailSecrets.includes('smtp_password')} onChange={() => toggleClearEmailSecret('smtp_password')} /> Clear saved SMTP password</label>}
          </>}
          {emailSettings.provider === 'brevo' && <>
            <Field label="Brevo API key"><Input type="password" value={emailSecrets.brevo_api_key} onChange={setEmailSecret('brevo_api_key')} placeholder={emailSecretStatus.brevo_api_key ? 'Saved; leave empty to keep it' : 'Paste your Brevo v3 API key'} /></Field>
            {emailSecretStatus.brevo_api_key && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearEmailSecrets.includes('brevo_api_key')} onChange={() => toggleClearEmailSecret('brevo_api_key')} /> Clear saved Brevo key</label>}
          </>}
          {emailSettings.provider === 'resend' && <>
            <Field label="Resend API key"><Input type="password" value={emailSecrets.resend_api_key} onChange={setEmailSecret('resend_api_key')} placeholder={emailSecretStatus.resend_api_key ? 'Saved; leave empty to keep it' : 'Paste your Resend API key'} /></Field>
            {emailSecretStatus.resend_api_key && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearEmailSecrets.includes('resend_api_key')} onChange={() => toggleClearEmailSecret('resend_api_key')} /> Clear saved Resend key</label>}
          </>}
          {emailSettings.provider === 'gmail' && <>
            <Field label="Google OAuth client ID"><Input value={emailSettings.gmail_client_id || ''} onChange={setEmailField('gmail_client_id')} placeholder="Google Cloud OAuth client ID" /></Field>
            <Field label="Google OAuth client secret"><Input type="password" value={emailSecrets.gmail_client_secret} onChange={setEmailSecret('gmail_client_secret')} placeholder={emailSecretStatus.gmail_client_secret ? 'Saved; leave empty to keep it' : 'Google OAuth client secret'} /></Field>
            <Field label="Google OAuth refresh token"><Input type="password" value={emailSecrets.gmail_refresh_token} onChange={setEmailSecret('gmail_refresh_token')} placeholder={emailSecretStatus.gmail_refresh_token ? 'Saved; leave empty to keep it' : 'Refresh token with Gmail send permission'} /></Field>
            {emailSecretStatus.gmail_client_secret && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearEmailSecrets.includes('gmail_client_secret')} onChange={() => toggleClearEmailSecret('gmail_client_secret')} /> Clear saved Google client secret</label>}
            {emailSecretStatus.gmail_refresh_token && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clearEmailSecrets.includes('gmail_refresh_token')} onChange={() => toggleClearEmailSecret('gmail_refresh_token')} /> Clear saved Gmail refresh token</label>}
          </>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Verify your sender address/domain with Brevo or Resend before sending. Gmail uses Google OAuth (not an API key); use OAuth credentials with the Gmail send scope and a refresh token. Credential values are encrypted on the server and never returned to the browser. Render Free has temporary local storage; use Render Environment variables if these settings must survive a spin-down or redeploy.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={saveEmailSettings} disabled={emailSettingsSaving || !loaded}>
            {emailSettingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save email settings
          </Button>
          {emailSettingsSaved && <span className="text-sm text-success" role="status">Email settings saved.</span>}
          {emailSettingsError && <span className="text-sm text-destructive" role="alert">{emailSettingsError}</span>}
        </div>
        <div className="mt-5 border-t pt-4">
          <h4 className="text-sm font-semibold">Test email and delivery history</h4>
          <p className="mt-1 text-xs text-muted-foreground">Save the email settings first. The test message uses the selected provider.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Test recipient"><Input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="you@example.com" /></Field>
            <Button type="button" onClick={sendTestEmail} disabled={testSending || !loaded || !testRecipient.trim()}>
              {testSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send test email
            </Button>
            <Button type="button" variant="outline" onClick={() => loadEmailDeliveries().catch((error) => setEmailLogsError(error.message || 'Could not load email history.'))}>
              Refresh history
            </Button>
          </div>
          {testStatus && <p className="mt-2 text-sm" role="status">{testStatus}</p>}
          {emailLogsError && <p className="mt-2 text-sm text-destructive" role="alert">{emailLogsError}</p>}
          <div className="mt-3 space-y-2">
            {emailDeliveries.length === 0 && !emailLogsError && <p className="text-xs text-muted-foreground">No email attempts have been recorded yet.</p>}
            {emailDeliveries.map((delivery) => (
              <div key={delivery.id} className="rounded-md border p-3 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{delivery.subject} · {delivery.recipient}</span>
                  <span className={delivery.status === 'sent' ? 'text-success' : 'text-destructive'}>{delivery.status} · {new Date(delivery.created_at).toLocaleString()}</span>
                </div>
                {delivery.error && <p className="mt-1 text-destructive">{delivery.error}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface mt-5 p-5">
        <h3 className="font-heading text-sm font-semibold">Monthly salary requests</h3>
        <p className="mt-1 text-xs text-muted-foreground">Bursary salary-payment requests are accepted only on this day of each month.</p>
        <Field label="Request day of month"><Input type="number" min="1" max="28" value={form.salary_payment_day ?? 25} onChange={set('salary_payment_day')} /></Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={saving || logoUploading || !loaded}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save settings
        </Button>
        {saved && <span className="flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" /> Settings saved</span>}
      </div>
    </AppShell>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}