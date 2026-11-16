import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import FeeReceiptReview from '@/components/bursary/FeeReceiptReview';

export default function PrincipalReceiptApprovals() {
  return <AppShell role="principal">
    <PageHeader title="Student payment history" description="Search and review submitted fee receipts and recorded payment decisions. Payment approval is handled by the Bursary." />
    <FeeReceiptReview readOnly />
  </AppShell>;
}
