import { Megaphone } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

export default function NoticeList({ notices, audience }) {
  const visible = notices.filter(
    (n) => !audience || n.audience === 'all' || n.audience === audience
  );

  if (!visible.length) {
    return <EmptyState icon={Megaphone} title="No notices right now" description="School announcements will show up here." />;
  }

  return (
    <div className="space-y-2">
      {visible.map((n) => (
        <div key={n.id} className="surface p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-heading text-sm font-semibold">{n.title}</h3>
            <span className="shrink-0 text-[11px] text-muted-foreground">{n.published_on}</span>
          </div>
          {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
        </div>
      ))}
    </div>
  );
}