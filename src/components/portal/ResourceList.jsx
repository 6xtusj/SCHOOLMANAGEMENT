import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { BookOpen, Download } from 'lucide-react';

export default function ResourceList({ resources, level, classArmId, track }) {
  const visible = resources.filter((resource) => (!resource.level || resource.level === level)
    && (!resource.class_arm_id || resource.class_arm_id === classArmId)
    && (!resource.track || resource.track === track));

  const open = async (item) => {
    if (!item.file_uri) return;
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: item.file_uri });
    window.open(signed_url, '_blank');
  };

  if (!visible.length) {
    return <EmptyState icon={BookOpen} title="No materials yet" description="School books and syllabus resources will appear here." />;
  }

  return (
    <div className="space-y-2">
      {visible.map((r) => (
        <div key={r.id} className="surface flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.title}</p>
            <p className="truncate text-xs text-muted-foreground">{[r.author, r.subject_name, r.category].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] capitalize">{r.category}</Badge>
            {r.file_uri && (
              <Button variant="ghost" size="icon" onClick={() => open(r)}><Download className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}