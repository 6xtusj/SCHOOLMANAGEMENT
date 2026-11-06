import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LEVELS, TRACKS } from '@/lib/school';
import { cn } from '@/lib/utils';
import { Plus, Pencil, Loader2 } from 'lucide-react';

const empty = { name: '', code: '', levels: [...LEVELS], tracks: [], compulsory: true, active: true };

export default function SubjectsPanel({ subjects, reload }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const startNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (s) => { setEditing(s); setForm({ ...empty, ...s }); setOpen(true); };

  const toggleIn = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { ...form };
    delete payload.id; delete payload.created_date; delete payload.updated_date; delete payload.created_by; delete payload.created_by_id;
    if (editing) await base44.entities.Subject.update(editing.id, payload);
    else await base44.entities.Subject.create(payload);
    setSaving(false);
    setOpen(false);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Add subject</Button>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Subject</th>
                <th className="px-4 py-3 text-left font-medium">Levels</th>
                <th className="px-4 py-3 text-left font-medium">Tracks</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.code || '—'}{s.active === false ? ' · inactive' : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(s.levels || []).join(', ') || 'All levels'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{(s.tracks || []).join(', ') || 'All tracks'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={s.compulsory ? 'default' : 'secondary'} className="text-[10px]">
                      {s.compulsory ? 'Compulsory' : 'Optional'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit subject' : 'Add subject'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Subject name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathematics" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Short code</Label>
                <Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MTH" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Classes offering this subject</Label>
              <div className="flex flex-wrap gap-1.5">
                {LEVELS.map((l) => (
                  <button key={l} type="button" onClick={() => toggleIn('levels', l)}
                    className={cn('rounded-md border px-2.5 py-1 text-xs', form.levels.includes(l) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Senior tracks (leave empty for all)</Label>
              <div className="flex flex-wrap gap-1.5">
                {TRACKS.map((t) => (
                  <button key={t} type="button" onClick={() => toggleIn('tracks', t)}
                    className={cn('rounded-md border px-2.5 py-1 text-xs', form.tracks.includes(t) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Compulsory subject</p>
                <p className="text-xs text-muted-foreground">Students cannot drop a compulsory subject</p>
              </div>
              <Switch checked={form.compulsory} onCheckedChange={(v) => setForm({ ...form, compulsory: v })} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive subjects are hidden from assignments</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save subject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}