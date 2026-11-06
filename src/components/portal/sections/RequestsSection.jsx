import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/EmptyState';
import { NotebookPen, Plus, Loader2 } from 'lucide-react';

const CATEGORIES = [
  ['other', 'General'],
  ['transcript', 'Transcript'],
  ['certificate', 'Certificate'],
  ['fee', 'Fees'],
  ['library', 'Library'],
  ['academic', 'Academic'],
];

export default function RequestsSection({ student, requests, raisedBy, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: 'other', subject: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.subject.trim()) return;
    setSaving(true);
    setError('');
    try {
    await base44.entities.PortalRequest.create({
      student_id: student?.id || '',
      student_name: student?.full_name || '',
      student_email: student?.user_email || '',
      guardian_email: student?.guardian_email || '',
      raised_by: raisedBy || '',
      category: form.category,
      subject: form.subject,
      message: form.message,
      status: 'pending',
    });
    setForm({ category: 'other', subject: '', message: '' });
    setOpen(false);
    onCreated();
    } catch (error) { setError(error.message || 'Could not submit request.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New request</Button>
      </div>

      {(requests || []).length ? (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.subject}</p>
                  <p className="text-xs capitalize text-muted-foreground">{r.category} · raised by {r.raised_by || 'portal'}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{(r.status || 'pending').replaceAll('_', ' ')}</Badge>
              </div>
              {r.message && <p className="mt-2 text-sm text-muted-foreground">{r.message}</p>}
              {r.response && (
                <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">School reply:</span> {r.response}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={NotebookPen} title="No requests yet" description="Ask the school office for a transcript, certificate or anything else." />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">What is it about?</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Request for first term transcript" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Details</Label>
              <Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving || !form.subject.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}