import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, UserPlus, Mail, Trash2, Copy, ShieldCheck, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

const ROLES = ['principal', 'teacher', 'bursar', 'librarian', 'student', 'parent'];
const ASSIGNABLE_ROLES = [...ROLES, 'user'];
const STATUSES = ['pending', 'active', 'suspended', 'deactivated'];
const FILTER_ROLES = ['admin', ...ROLES];

export default function PortalAccounts() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState('25');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [invite, setInvite] = useState({ email: '', role: 'teacher' });
  const [sending, setSending] = useState(false);
  const [working, setWorking] = useState('');
  const [delivery, setDelivery] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, role, status, page: String(page), per_page: perPage });
      const response = await fetch(`/api/admin/portal-accounts?${params}`, { credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load portal accounts.');
      setUsers(data.items || []); setTotal(data.total || 0); setTotalPages(data.total_pages || 1);
    } catch (error) {
      toast({ title: 'Could not load accounts', description: error.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [query, role, status, page, perPage, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 280);
    return () => window.clearTimeout(timer);
  }, [load]);

  const update = async (user, patch, message) => {
    if (user.is_primary_admin || user.email?.toLowerCase() === 'admin@school.local') {
      toast({ title: 'Primary administrator is protected', description: 'This account cannot be deactivated, deleted or reassigned.', variant: 'destructive' });
      return;
    }
    setWorking(user.id);
    try {
      await base44.entities.User.update(user.id, patch);
      toast({ title: message, description: user.email });
      await load({ quiet: true });
    } catch (error) {
      toast({ title: 'Account update failed', description: error?.message || 'Try again.', variant: 'destructive' });
    } finally { setWorking(''); }
  };

  const send = async () => {
    if (!invite.email.trim()) return;
    setSending(true);
    try {
      const result = await base44.users.inviteUser(invite.email.trim(), invite.role);
      setDelivery({ email: invite.email.trim(), ...result });
      toast({ title: result.email_sent ? 'Invitation email sent' : 'Account created; email not sent', description: result.email_sent ? invite.email : (result.email_error || 'Copy the invitation link below.') });
      setInvite({ email: '', role: 'teacher' });
      await load({ quiet: true });
    } catch (error) {
      toast({ title: 'Could not send the invitation', description: error?.message || 'Try again.', variant: 'destructive' });
    } finally { setSending(false); }
  };

  const resend = async (user) => {
    setWorking(user.id);
    try {
      const result = await base44.users.resendInvite(user.id);
      setDelivery({ email: user.email, ...result });
      toast({ title: result.email_sent ? 'Email sent' : 'Email was not sent', description: result.email_sent ? user.email : (result.email_error || 'Copy the link shown below.') });
    } catch (error) {
      toast({ title: 'Could not resend email', description: error?.message || 'Try again.', variant: 'destructive' });
    } finally { setWorking(''); }
  };

  const remove = async (user) => {
    if (!window.confirm(`Permanently delete the portal account for ${user.email}? This also removes its login credentials. This cannot be undone.`)) return;
    setWorking(user.id);
    try {
      await base44.users.deleteAccount(user.id);
      toast({ title: 'Portal account permanently deleted', description: user.email });
      if (delivery?.email === user.email) setDelivery(null);
      await load({ quiet: true });
    } catch (error) {
      toast({ title: 'Could not delete account', description: error?.message || 'Try again.', variant: 'destructive' });
    } finally { setWorking(''); }
  };

  const changeFilter = (setter, value) => { setter(value); setPage(1); };
  const first = total ? ((page - 1) * Number(perPage)) + 1 : 0;
  const last = Math.min(page * Number(perPage), total);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="surface overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-heading text-sm font-semibold">Portal directory</h3><p className="text-xs text-muted-foreground">Search and filter portal login accounts saved on this server, including large school directories. Student or staff records alone are not portal accounts.</p></div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_160px_160px]">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, email, role, status or ID…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
            <Select value={role} onValueChange={(v) => changeFilter(setRole, v)}><SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{FILTER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
            <Select value={status} onValueChange={(v) => changeFilter(setStatus, v)}><SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{total.toLocaleString()} matching account{total === 1 ? '' : 's'}</span><label className="flex items-center gap-2">Rows per page<Select value={perPage} onValueChange={(v) => { setPerPage(v); setPage(1); }}><SelectTrigger className="h-8 w-[82px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select></label></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3 text-left font-medium">Account</th><th className="px-4 py-3 text-left font-medium">Portal role</th><th className="px-4 py-3 text-left font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading accounts…</td></tr> : users.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{u.email}</p><p className="text-xs text-muted-foreground">{u.full_name || '—'}</p>{u.is_primary_admin && <Badge className="mt-1 gap-1" variant="secondary"><ShieldCheck className="h-3 w-3" /> Primary school administrator</Badge>}{u.role === 'user' && <Badge variant="outline" className="mt-1 text-[10px]">No portal access</Badge>}</td>
                  <td className="px-4 py-3">{u.is_primary_admin ? <Badge variant="outline">Administrator (protected)</Badge> : <Select value={u.role || 'user'} onValueChange={(v) => update(u, { role: v }, 'Portal role updated')}><SelectTrigger className="h-8 w-32" disabled={working === u.id}><SelectValue /></SelectTrigger><SelectContent>{ASSIGNABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>}</td>
                  <td className="px-4 py-3">{u.is_primary_admin ? <Badge variant="outline">Always active</Badge> : <Select value={u.account_status || 'pending'} onValueChange={(v) => update(u, { account_status: v }, 'Account status updated')}><SelectTrigger className="h-8 w-36" disabled={working === u.id}><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap"><div className="flex justify-end gap-1">{!u.is_primary_admin && <><Button variant="ghost" size="sm" className="gap-1" onClick={() => resend(u)} disabled={working === u.id}>{working === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Resend</Button><Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => remove(u)} disabled={working === u.id}><Trash2 className="h-3.5 w-3.5" /> Delete</Button></>}</div></td>
                </tr>
              ))}
              {!loading && !users.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No accounts match your search and filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"><p className="text-xs text-muted-foreground">Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}</p><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /> Previous</Button><span className="min-w-20 text-center text-xs text-muted-foreground">Page {page} of {totalPages}</span><Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next <ChevronRight className="h-4 w-4" /></Button></div></div>
      </div>

      <div className="surface h-fit p-5">
        <h3 className="font-heading text-sm font-semibold">Invite someone</h3>
        <p className="mt-1 text-xs text-muted-foreground">Create a portal account and generate a secure invitation link. Email is optional; you can copy and share the link manually.</p>
        <div className="mt-4 space-y-3"><Input placeholder="name@email.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /><Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select><Button onClick={send} disabled={sending || !invite.email.trim()} className="w-full gap-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Send invitation</Button>
          {delivery && <div className="space-y-2 rounded-lg border border-border p-3 text-xs"><p className="font-medium">{delivery.email_sent ? 'Email delivered to mail server' : 'Email not delivered'}</p><p className="text-muted-foreground">{delivery.email_error || 'The recipient should check their inbox.'}</p>{delivery.invite_url && <><Input readOnly value={delivery.invite_url} className="text-xs" /><Button variant="outline" size="sm" className="w-full gap-2" onClick={() => navigator.clipboard.writeText(delivery.invite_url)}><Copy className="h-3.5 w-3.5" /> Copy secure link</Button></>}</div>}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">Search supports email, name, role, status and account ID. Results are paginated on the server (25, 50 or 100 at a time), so the browser does not load the full school directory. Deleting a portal account removes its login only, not its associated student, teacher or parent record. The primary school administrator is protected.</p>
      </div>
    </div>
  );
}
