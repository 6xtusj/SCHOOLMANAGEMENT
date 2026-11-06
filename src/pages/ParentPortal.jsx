import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import PortalSection, { SECTIONS } from '@/components/portal/PortalSection';
import usePortalUser from '@/lib/usePortalUser';
import { items } from '@/lib/school';
import { loadLearnerData } from '@/lib/portalData';
import { cn } from '@/lib/utils';
import { Users, Loader2 } from 'lucide-react';
import ParentSchoolContacts from '@/components/portal/ParentSchoolContacts';

export default function ParentPortal() {
  const { user, loading } = usePortalUser();
  const { section = 'overview' } = useParams();
  const [children, setChildren] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [data, setData] = useState(null);
  const [loadingChild, setLoadingChild] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      // The Flask API applies linked-child row-level access before returning records.
      // Listing through that policy supports multiple guardian fields and multiple children.
      const linkedRows = await base44.entities.Student.list({ limit: 500 });
      const list = [...new Map(items(linkedRows).map((student) => [student.id, student])).values()];
      setChildren(list);
      setActiveId(list[0]?.id || '');
      setReady(true);
    })();
  }, [user?.email]);

  const active = children.find((c) => c.id === activeId);

  useEffect(() => {
    if (!active) return;
    setLoadingChild(true);
    (async () => {
      setData(await loadLearnerData(active));
      setLoadingChild(false);
    })();
  }, [active?.id]);

  const reload = async () => {
    if (active) setData(await loadLearnerData(active));
  };

  const title = SECTIONS[section] || 'My children';

  return (
    <AppShell role="parent">
      <PageHeader
        title={section === 'overview' ? `Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}` : title}
        description={active ? `${active.full_name} · ${active.class_arm_name || active.level}` : 'Results, attendance and fees for each child linked to your account.'}
      />

      {loading || !ready ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your family record…</div>
      ) : !children.length ? (
        <EmptyState
          icon={Users}
          title="No child linked to this account yet"
          description={`Ask the school office to add ${user?.email} as the guardian of your child. They will then appear here.`}
        />
      ) : (
        <>
          {children.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {children.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'surface px-4 py-2 text-left transition-colors',
                    c.id === activeId ? 'border-primary bg-primary/5' : 'hover:border-primary/30'
                  )}
                >
                  <p className="text-sm font-medium">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">{c.class_arm_name || c.level}</p>
                </button>
              ))}
            </div>
          )}

          {loadingChild || !data ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading {active?.full_name.split(' ')[0] || 'record'}…</div>
          ) : (
            <><PortalSection section={section} ctx={{ ...data, student: active, user, isLearner: false, reload }} />{section === "overview" && <ParentSchoolContacts student={active} />}</>
          )}
        </>
      )}
    </AppShell>
  );
}