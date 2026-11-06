import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import StaffList from '@/components/admin/StaffList';
import AssignmentsPanel from '@/components/admin/AssignmentsPanel';
import PortalAccounts from '@/components/admin/PortalAccounts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { items, sortArms } from '@/lib/school';

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [arms, setArms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const loadStaff = async () => {
    const res = await base44.entities.StaffProfile.list({ sort: 'full_name', limit: 200 });
    setStaff(items(res));
  };
  const loadAssignments = async () => {
    const res = await base44.entities.Assignment.list({ sort: '-created_date', limit: 500 });
    setAssignments(items(res));
  };

  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        base44.entities.ClassArm.list({ sort: 'order', limit: 200 }),
        base44.entities.Subject.list({ sort: 'name', limit: 200 }),
      ]);
      setArms(sortArms(items(a).filter((x) => x.active)));
      setSubjects(items(s));
      loadStaff();
      loadAssignments();
    })();
  }, []);

  const activeStaff = staff.filter((s) => s.active && s.email);

  return (
    <AppShell role="admin">
      <PageHeader title="Staff & assignments" description="Teachers, subject allocations and form teacher roles." />
      <Tabs defaultValue="assignments">
        <TabsList className="mb-5">
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="accounts">Portal accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <AssignmentsPanel
            arms={arms}
            subjects={subjects}
            staff={activeStaff}
            assignments={assignments}
            reload={loadAssignments}
          />
        </TabsContent>
        <TabsContent value="staff">
          <StaffList staff={staff} reload={loadStaff} />
        </TabsContent>
        <TabsContent value="accounts">
          <PortalAccounts />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}