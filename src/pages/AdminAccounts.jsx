import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import PortalAccounts from '@/components/admin/PortalAccounts';

export default function AdminAccounts() {
  return (
    <AppShell role="admin">
      <PageHeader
        title="Portal accounts"
        description="Approve, suspend, deactivate or reassign the bursary, library, teaching and learner accounts."
      />
      <PortalAccounts />
    </AppShell>
  );
}