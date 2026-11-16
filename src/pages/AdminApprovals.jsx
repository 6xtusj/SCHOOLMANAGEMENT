import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import ApprovalPanel from '@/components/ApprovalPanel';
import { useAuth } from '@/lib/AuthContext';

export default function AdminApprovals() {
  const { user } = useAuth();
  return <AppShell role="admin">
    <PageHeader title="Assigned approvals" description="Review only the approval categories assigned to your account. You cannot approve a request you submitted yourself." />
    <ApprovalPanel role={user?.role || 'admin'} />
  </AppShell>;
}
