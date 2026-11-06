import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Mail, Loader2 } from 'lucide-react';

export default function StaffList({ staff, reload }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'teacher', employment_date: '' });
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(null);

  const add = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    await base44.entities.StaffProfile.create({ ...form, active: true });
    setForm({ full_name: '', email: '', phone: '', role: 'teacher', employment_date: '' });
    setSaving(false);
    reload();
  };

  const toggle = async (member) => {
    await base44.entities.StaffProfile.update(member.id, { active: !member.active });
    reload();
  };

  const remove = async (member) => {
    if (!window.confirm(`Remove ${member.full_name} from staff?`)) return;
    await base44.entities.StaffProfile.delete(member.id);
    reload();
  };

  const invite = async (member) => {
    if (!member.email) {
      toast({ title: 'Add an email address first', variant: 'destructive' });
      return;
    }
    setInviting(member.id);
    try {
      await base44.users.inviteUser(member.email, 'user');
      toast({ title: 'Invitation sent', description: `${member.full_name} can sign up with ${member.email}.` });
    } catch (error) {
      toast({ title: 'Could not send the invitation', description: error?.message || 'Try again.', variant: 'destructive' });
    }
    setInviting(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-left font-medium">Role / Employment</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{m.full_name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <p>{m.email || '—'}</p>
                    <p>{m.phone || ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px] capitalize">{m.role}</Badge><p className="mt-1 text-[10px] text-muted-foreground">Employed: {m.employment_date || "Not recorded"}</p>
                      <button onClick={() => toggle(m)} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                        {m.active ? 'Deactivate' : 'Activate'}
                      </button>
                      {!m.active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => invite(m)} disabled={inviting === m.id} title="Invite to the portal">
                        {inviting === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!staff.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No staff yet — add your first teacher.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface h-fit p-5">
        <h3 className="font-heading text-sm font-semibold">Add a staff member</h3>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Full name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Employment date</Label>
            <Input type="date" value={form.employment_date} onChange={(e) => setForm({ ...form, employment_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="principal">Principal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={saving || !form.full_name.trim()} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add staff
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Use the mail icon to invite a teacher to the portal, then set their portal role under Portal accounts.
          </p>
        </div>
      </div>
    </div>
  );
}