import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import usePortalUser from '@/lib/usePortalUser';

export default function RoleRedirect() {
  const { role, status, loading } = usePortalUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (status === 'suspended' || status === 'deactivated') {
      navigate('/account-suspended', { replace: true });
      return;
    }
    const target = role === 'admin'
      ? '/admin'
      : role === 'principal'
        ? '/principal'
      : role === 'bursar'
        ? '/bursary'
        : role === 'librarian'
          ? '/library'
          : `/${role}`;
    navigate(target, { replace: true });
  }, [role, status, loading, navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
    </div>
  );
}