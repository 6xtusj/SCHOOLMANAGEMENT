import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import PortalAccounts from '@/components/admin/PortalAccounts';
import { useAuth } from '@/lib/AuthContext';

export default function AdminAccounts() {
  const { user } = useAuth();
  return (
    <AppShell role="admin">
      <PageHeader
        title="Portal accounts"
        description="Approve, suspend, deactivate or reassign the bursary, library, teaching and learner accounts."
      />
      {user?.is_primary_admin ? <PortalAccounts /> : <p className="surface p-5 text-sm text-muted-foreground">Only the Primary Admin can manage portal account roles, suspension, deactivation and deletion.</p>}
    </AppShell>
  );
}