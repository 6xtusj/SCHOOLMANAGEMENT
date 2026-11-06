import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import ClassArmsPanel from '@/components/admin/ClassArmsPanel';
import SubjectsPanel from '@/components/admin/SubjectsPanel';
import SubjectRulesPanel from '@/components/admin/SubjectRulesPanel';
import CurriculumDocumentsPanel from '@/components/admin/CurriculumDocumentsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { items, sortArms } from '@/lib/school';

export default function AdminAcademics() {
  const [arms, setArms] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const loadArms = async () => setArms(sortArms(items(await base44.entities.ClassArm.list({ sort: 'order', limit: 200 }))));
  const loadSubjects = async () => setSubjects(items(await base44.entities.Subject.list({ sort: 'name', limit: 300 })));

  useEffect(() => { loadArms(); loadSubjects(); }, []);

  return (
    <AppShell role="admin">
      <PageHeader title="Classes & subjects" description="Class arms, track offerings and the curriculum per level." />
      <Tabs defaultValue="arms">
        <TabsList className="mb-5">
          <TabsTrigger value="arms">Class arms</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="rules">Subject rules</TabsTrigger>
          <TabsTrigger value="curriculum">Curriculum documents</TabsTrigger>
        </TabsList>
        <TabsContent value="arms"><ClassArmsPanel arms={arms} reload={loadArms} /></TabsContent>
        <TabsContent value="subjects"><SubjectsPanel subjects={subjects} reload={loadSubjects} /></TabsContent>
        <TabsContent value="rules"><SubjectRulesPanel arms={arms} subjects={subjects} /></TabsContent>
        <TabsContent value="curriculum"><CurriculumDocumentsPanel /></TabsContent>
      </Tabs>
    </AppShell>
  );
}