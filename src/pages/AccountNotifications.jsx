import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import NotificationsSection from '@/components/portal/sections/NotificationsSection';
import { useAuth } from '@/lib/AuthContext';

export default function AccountNotifications() {
  const { user } = useAuth();

  return (
    <AppShell role={user?.role || 'student'}>
      <PageHeader title="Notification settings" description="Choose which school activity emails you receive." />
      <NotificationsSection />
    </AppShell>
  );
}
