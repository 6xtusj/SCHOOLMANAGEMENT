import { useEffect, useState } from 'react';
import { LayoutDashboard, Menu, Moon, Sun, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import NotificationBell from '@/components/NotificationBell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { getSchoolSettings, subscribeSettings } from '@/lib/schoolSettings';
import { useAuth } from '@/lib/AuthContext';

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('school-theme', theme);
}

export default function AppShell({ role, children }) {
  const { user } = useAuth();
  const portalRole = user?.role === 'principal' ? 'principal' : (user?.role && user.role !== 'admin' ? user.role : role);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [school, setSchool] = useState('School');
  const [logo, setLogo] = useState('');
  const [activePrivileges, setActivePrivileges] = useState(user?.active_privileges || []);

  useEffect(() => {
    const saved = localStorage.getItem('school-theme') || 'dark';
    setTheme(saved);
    applyTheme(saved);
    getSchoolSettings().then((record) => {
      if (record?.school_name) setSchool(record.school_name);
      setLogo(record?.school_logo || '');
    });
    return subscribeSettings((record) => {
      if (record?.school_name) setSchool(record.school_name);
      setLogo(record?.school_logo || '');
    });
  }, []);

  useEffect(() => {
    setActivePrivileges(user?.active_privileges || []);
    if (!user?.id) return;
    fetch('/api/staff/my-privileges', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : [])
      .then((rows) => setActivePrivileges(Array.isArray(rows) ? rows.map((row) => row.privilege_key) : []))
      .catch(() => setActivePrivileges(user?.active_privileges || []));
  }, [user?.id]);

  useEffect(() => {
    document.title = school || 'School Portal';
  }, [school]);

  const portalPath = (roleName) => ({ admin: '/admin', principal: '/principal', teacher: '/teacher', bursar: '/bursary', librarian: '/library', parent: '/parent', student: '/student' }[roleName] || '/workspace');

  const switchPortal = async (nextRole) => {
    if (!nextRole || nextRole === user?.role) return;
    try {
      const token = document.cookie.split('; ').find((part) => part.startsWith('school_csrf_token='))?.slice('school_csrf_token='.length) || '';
      const response = await fetch('/api/auth/portal-role', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ role: nextRole }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not switch portal.');
      window.location.assign(portalPath(nextRole));
    } catch (error) { window.alert(error.message || 'Could not switch portal.'); }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        <AppSidebar role={portalRole} schoolName={school} schoolLogo={logo} privileges={activePrivileges} isPrimaryAdmin={!!user?.is_primary_admin} restrictedAdmin={!!user?.is_restricted_admin} />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-xl sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-r border-sidebar-border bg-sidebar p-0">
                <AppSidebar role={portalRole} schoolName={school} schoolLogo={logo} privileges={activePrivileges} isPrimaryAdmin={!!user?.is_primary_admin} restrictedAdmin={!!user?.is_restricted_admin} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="hidden min-w-0 truncate font-heading text-sm font-medium text-muted-foreground sm:block">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {(user?.available_portal_roles || []).length > 1 && <Select value={user?.role || role} onValueChange={switchPortal}><SelectTrigger className="h-9 w-[118px] text-xs" aria-label="Switch portal"><SelectValue placeholder="Portal" /></SelectTrigger><SelectContent>{user.available_portal_roles.map((portal) => <SelectItem key={portal} value={portal} className="capitalize">{portal} portal</SelectItem>)}</SelectContent></Select>}
            <NotificationBell />
            <Button asChild variant="ghost" size="sm" className="h-11 w-11 px-0 sm:h-8 sm:w-auto sm:px-3">
              <Link to="/workspace" aria-label="Dashboard"><LayoutDashboard className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Dashboard</span></Link>
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label="Sign out" onClick={() => base44.auth.logout('/login')}>
              <LogOut className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-7xl px-3 py-5 sm:px-6 sm:py-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}