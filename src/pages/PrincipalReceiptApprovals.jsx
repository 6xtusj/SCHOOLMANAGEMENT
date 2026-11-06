import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import FeeReceiptReview from '@/components/bursary/FeeReceiptReview';

export default function PrincipalReceiptApprovals() {
  return <AppShell role="principal">
    <PageHeader title="Fee receipt approvals" description="Review submitted bank receipts and approve or reject verified payments." />
    <FeeReceiptReview />
  </AppShell>;
}
