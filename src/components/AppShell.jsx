import { useEffect, useState } from 'react';
import { LayoutDashboard, Menu, Moon, Sun, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import AppSidebar from '@/components/AppSidebar';
import { base44 } from '@/api/base44Client';
import { getSchoolSettings, subscribeSettings } from '@/lib/schoolSettings';
import { useAuth } from '@/lib/AuthContext';

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('school-theme', theme);
}

export default function AppShell({ role, children }) {
  const { user } = useAuth();
  const portalRole = user?.role === 'principal' ? 'principal' : role;
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [school, setSchool] = useState('School');
  const [logo, setLogo] = useState('');

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
    document.title = school || 'School Portal';
  }, [school]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border lg:block">
        <AppSidebar role={portalRole} schoolName={school} schoolLogo={logo} />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-r border-sidebar-border bg-sidebar p-0">
                <AppSidebar role={portalRole} schoolName={school} schoolLogo={logo} onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="truncate font-heading text-sm font-medium text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/workspace"><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => base44.auth.logout('/login')}>
              <LogOut className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}