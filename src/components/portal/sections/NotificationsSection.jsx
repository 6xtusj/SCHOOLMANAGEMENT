import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';

const CATEGORIES = [
  ['finance', 'Finance', 'Fee receipt decisions, recorded payments, and staff salary notices'],
  ['academics', 'Academics', 'Published results and academic workflow updates'],
  ['attendance', 'Attendance', 'Attendance updates for linked students'],
  ['notices', 'School notices', 'New school announcements'],
  ['requests', 'Requests', 'Request status changes and responses from the school office'],
  ['library', 'Library', 'Book issue, due-date, and return updates'],
  ['admissions', 'Admissions', 'Admission and examination schedule updates'],
  ['approvals', 'Approvals', 'Requests awaiting your approval and decisions on requests you submitted'],
  ['operations', 'School operations', 'Important account and school-operation changes'],
];

export default function NotificationsSection() {
  const [form, setForm] = useState(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/notifications/preferences', { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load notification preferences.');
      setForm({ email_enabled: data.email_enabled, categories: data.categories });
      setEmailConfigured(data.email_configured);
    } catch (loadError) {
      setError(loadError.message || 'Could not load notification preferences.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save notification preferences.');
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message || 'Could not save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading notification settings…</div>;
  }

  if (!form) {
    return <div className="surface max-w-xl space-y-3 p-5" role="alert">
      <p className="text-sm text-destructive">{error || 'Notification settings are unavailable.'}</p>
      <Button size="sm" onClick={load}>Try again</Button>
    </div>;
  }

  return (
    <div className="surface max-w-2xl space-y-5 p-5">
      <div>
        <h2 className="font-heading text-sm font-semibold">Email notification settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">Choose which portal activity updates should be sent to your account email.</p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Email notifications</p>
          <p className="text-xs text-muted-foreground">Turn all school activity emails on or off.</p>
        </div>
        <Switch checked={form.email_enabled} onCheckedChange={(value) => { setForm({ ...form, email_enabled: value }); setSaved(false); }} />
      </div>
      <div className={`space-y-3 ${form.email_enabled ? '' : 'opacity-50'}`}>
        {CATEGORIES.map(([key, label, hint]) => (
          <div key={key} className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <Switch
              checked={form.categories[key]}
              disabled={!form.email_enabled}
              onCheckedChange={(value) => {
                setForm({ ...form, categories: { ...form.categories, [key]: value } });
                setSaved(false);
              }}
            />
          </div>
        ))}
      </div>
      {!emailConfigured && <p className="rounded-md bg-warning/10 p-3 text-xs text-warning">Email delivery is not configured on this server. Choose a provider in Admin → School Settings to send emails.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save preferences
        </Button>
        {saved && <span className="text-xs text-success">Preferences saved</span>}
      </div>
    </div>
  );
}
