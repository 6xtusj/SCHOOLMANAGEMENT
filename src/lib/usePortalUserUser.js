import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const KNOWN = ['admin', 'principal', 'teacher', 'bursar', 'librarian', 'student', 'parent'];

export default function usePortalUser() {
  const [state, setState] = useState({ user: null, role: null, status: 'active', loading: true });

  useEffect(() => {
    let active = true;
    (async () => {
      let user = null;
      try {
        user = await base44.auth.me();
      } catch {
        user = null;
      }
      let role = user?.role || 'student';
      if (!KNOWN.includes(role)) {
        const email = user?.email;
        let resolved = null;
        if (email) {
          const staff = await base44.entities.StaffProfile.filter({ email });
          if (staff.length) resolved = staff[0].role || 'teacher';
          if (!resolved) {
            const own = await base44.entities.Student.filter({ user_email: email });
            if (own.length) resolved = 'student';
          }
          if (!resolved) {
            const child = await base44.entities.Student.filter({ guardian_email: email });
            if (child.length) resolved = 'parent';
          }
        }
        role = resolved || 'student';
      }
      if (active) setState({ user, role, status: user?.account_status || 'active', loading: false });
    })();
    return () => {
      active = false;
    };
  }, []);

  return state;
}