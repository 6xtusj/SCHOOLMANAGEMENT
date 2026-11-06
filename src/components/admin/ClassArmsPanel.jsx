import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LEVELS, SENIOR_LEVELS, TRACKS } from '@/lib/school';
import { Plus, Power, Loader2, Trash2 } from 'lucide-react';

export default function ClassArmsPanel({ arms, reload }) {
  const [form, setForm] = useState({ level: 'JSS 1', arm: 'A', track: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [replacementId, setReplacementId] = useState('');
  const senior = SENIOR_LEVELS.includes(form.level);

  const add = async () => {
    if (!form.arm.trim()) return;
    const track = senior ? form.track : '';
    if (senior && !track) return;
    const duplicate = arms.some((item) => item.level.replace(/\s/g, '').toLowerCase() === form.level.replace(/\s/g, '').toLowerCase()
      && item.arm.trim().toLowerCase() === form.arm.trim().toLowerCase()
      && (item.track || '').toLowerCase().replace(/s$/, '') === track.toLowerCase().replace(/s$/, ''));
    if (duplicate) { setMessage('That class arm or track already exists.'); return; }
    const display = track ? `${form.level} ${track} ${form.arm}` : `${form.level}${form.arm}`;
    setSaving(true);
    setMessage('');
    try {
      await base44.entities.ClassArm.create({
        level: form.level,
        arm: form.arm.toUpperCase(),
        track,
        display_name: display,
        order: LEVELS.indexOf(form.level) * 10 + (track ? TRACKS.indexOf(track) : 0),
        active: true,
      });
      setForm({ ...form, arm: '' });
      reload();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  const toggle = async (arm) => {
    try { await base44.entities.ClassArm.update(arm.id, { active: !arm.active }); reload(); }
    catch (error) { setMessage(error.message); }
  };

  const remove = async () => {
    if (!deleteTarget || !replacementId) return;
    setSaving(true);
    setMessage('');
    try {
      const result = await base44.classArms.reassignAndDelete(deleteTarget.id, replacementId);
      setMessage(`Class arm deleted. ${result.students_reassigned} student(s) reassigned.`);
      setDeleteTarget(null);
      setReplacementId('');
      reload();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {message && <p role="status" className="rounded-md border px-3 py-2 text-sm">{message}</p>}
      <div className="surface flex flex-wrap items-end gap-3 p-5">
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Level</label>
          <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v, track: '' })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Arm</label>
          <Input value={form.arm} onChange={(e) => setForm({ ...form, arm: e.target.value })} placeholder="A" className="w-20" />
        </div>
        {senior && (
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Track</label>
            <Select value={form.track || 'none'} onValueChange={(v) => setForm({ ...form, track: v === 'none' ? '' : v })}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Choose track" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose track</SelectItem>
                {TRACKS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={add} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add class arm
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {arms.map((a) => (
          <div key={a.id} className="surface flex items-center justify-between p-4">
            <div>
              <p className="font-heading text-sm font-semibold">{a.display_name}</p>
              <p className="text-xs text-muted-foreground">{a.track || a.level}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={a.active ? 'default' : 'secondary'} className="text-[10px]">{a.active ? 'Active' : 'Inactive'}</Badge>
              <Button variant="ghost" size="icon" onClick={() => toggle(a)} title="Toggle status">
                <Power className={a.active ? 'h-4 w-4 text-success' : 'h-4 w-4 text-muted-foreground'} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => { setDeleteTarget(a); setReplacementId(''); setMessage(''); }} title="Delete class arm and reassign students">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {deleteTarget?.display_name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Students in this class arm will be moved to another arm in the same level before it is deleted.</p>
          <Select value={replacementId} onValueChange={setReplacementId}>
            <SelectTrigger><SelectValue placeholder="Choose destination class arm" /></SelectTrigger>
            <SelectContent>
              {arms.filter((item) => item.id !== deleteTarget?.id && item.active && item.level === deleteTarget?.level).map((item) => <SelectItem key={item.id} value={item.id}>{item.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={saving || !replacementId} onClick={remove}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reassign and delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}