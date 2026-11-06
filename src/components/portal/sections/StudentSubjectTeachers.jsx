import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { items } from '@/lib/school';
import EmptyState from '@/components/EmptyState';
import { BookOpen } from 'lucide-react';

export default function StudentSubjectTeachers({ student }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!student?.class_arm_id) return;
    base44.entities.Assignment.list({ limit: 1000 }).then((result) => {
      setRows(items(result).filter((a) => a.type === 'subject' && String(a.class_arm_id) === String(student.class_arm_id)));
    });
  }, [student?.class_arm_id]);
  return (
    <section className="surface p-4">
      <h2 className="mb-3 text-sm font-semibold">My subjects and teachers</h2>
      {rows.length ? (
        <div className="divide-y">
          {rows.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{a.subject_name || 'Subject'}</p>
                <p className="text-xs text-muted-foreground">{a.class_arm_name || student.class_arm_name}</p>
              </div>
              <p className="text-right text-xs">{a.teacher_name || a.teacher_email || 'Teacher not assigned'}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title="No subject teachers listed" description="Your subject allocations will appear here once published by the school." />
      )}
    </section>
  );
}
