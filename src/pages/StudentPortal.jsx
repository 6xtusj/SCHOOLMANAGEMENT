import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import PortalSection, { SECTIONS } from '@/components/portal/PortalSection';
import usePortalUser from '@/lib/usePortalUser';
import { items } from '@/lib/school';
import { loadLearnerData } from '@/lib/portalData';
import { GraduationCap, Loader2 } from 'lucide-react';

export default function StudentPortal() {
  const { user, loading } = usePortalUser();
  const { section = 'overview' } = useParams();
  const [student, setStudent] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  const reload = useCallback(async () => {
    if (!student) return;
    setData(await loadLearnerData(student));
  }, [student]);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      // Backend row-level access returns only records linked to this student account.
      const own = items(await base44.entities.Student.list({ limit: 500 }));
      const me = own.find((record) => [record.user_email, record.student_email].some((email) => String(email || '').toLowerCase() === user.email.toLowerCase())) || own[0];
      if (!me) {
        setBusy(false);
        return;
      }
      setStudent(me);
      setData(await loadLearnerData(me));
      setBusy(false);
    })();
  }, [user?.email]);

  const title = SECTIONS[section] || 'My portal';

  return (
    <AppShell role="student">
      <PageHeader
        title={section === 'overview' ? `Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : student?.full_name ? `, ${student.full_name.split(' ')[0]}` : ''}` : title}
        description={student ? `${student.admission_no || ''} · ${student.class_arm_name || student.level}` : 'Your academic record, timetable, results and fees.'}
      />
      {loading || busy ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your portal…</div>
      ) : !student ? (
        <EmptyState
          icon={GraduationCap}
          title="No student record linked to this account"
          description={`The school office needs to link your record to ${user?.email}. Once they do, your results, timetable and fees appear here.`}
        />
      ) : (
        <PortalSection section={section} ctx={{ ...data, student, user, isLearner: true, reload }} />
      )}
    </AppShell>
  );
}