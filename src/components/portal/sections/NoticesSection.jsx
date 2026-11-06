import NoticeList from '@/components/portal/NoticeList';

export default function NoticesSection({ notices, audience }) {
  return <NoticeList notices={notices || []} audience={audience} />;
}