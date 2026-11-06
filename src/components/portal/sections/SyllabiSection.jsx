import ResourceList from '@/components/portal/ResourceList';

export default function SyllabiSection({ resources, level }) {
  const list = (resources || []).filter((r) => r.category === 'syllabus' || r.category === 'exam');
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Syllabi and past questions published by the school.</p>
      <ResourceList resources={list} level={level} />
    </div>
  );
}