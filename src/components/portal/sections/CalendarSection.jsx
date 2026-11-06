import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { CalendarDays } from 'lucide-react';

export default function CalendarSection({ events }) {
  const list = events || [];
  if (!list.length) {
    return <EmptyState icon={CalendarDays} title="Nothing on the calendar" description="Exams, holidays and school events will show up here." />;
  }

  return (
    <div className="space-y-2">
      {list.map((e) => (
        <div key={e.id} className="surface flex items-start justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">{e.title}</p>
            <p className="text-xs text-muted-foreground">
              {e.date}{e.end_date ? ` → ${e.end_date}` : ''}{e.level ? ` · ${e.level}` : ''}
            </p>
            {e.description && <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>}
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{e.type}</Badge>
        </div>
      ))}
    </div>
  );
}