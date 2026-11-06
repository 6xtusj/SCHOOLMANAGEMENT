import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';
import ProfileSection from '@/components/portal/sections/ProfileSection';
import { base44 } from '@/api/base44Client';
import usePortalUser from '@/lib/usePortalUser';
import { items } from '@/lib/school';

export default function AccountProfile() {
  const { user } = usePortalUser();
  const [staffProfile, setStaffProfile] = useState(null);
  const [portalProfile, setPortalProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const [staffRows, portalRows] = await Promise.all([
        base44.entities.StaffProfile.filter({ email: user.email }, { limit: 1 }).catch(() => []),
        base44.entities.PortalProfile.filter({ email: user.email }, { limit: 1 }).catch(() => []),
      ]);
      setStaffProfile(items(staffRows)[0] || null);
      setPortalProfile(items(portalRows)[0] || null);
    } finally { setLoading(false); }
  }, [user?.email]);
  useEffect(() => { load(); }, [load]);
  return <AppShell role={user?.role || 'admin'}><PageHeader title="Profile & settings" description="Manage your personal contact details, profile photo, login email and staff payment information."/>{loading ? <p className="py-8 text-sm text-muted-foreground">Loading your saved profile…</p> : <ProfileSection profile={portalProfile || {}} user={user} staffProfile={staffProfile} onSaved={load}/>}</AppShell>;
}
