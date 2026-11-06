import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
const AuthContext = createContext(null);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState({});
  const checkUserAuth = useCallback(async () => {
    try { const current = await base44.auth.me(); setUser(current); setIsAuthenticated(true); setAuthError(null); return current; }
    catch { setUser(null); setIsAuthenticated(false); return null; }
    finally { setIsLoadingAuth(false); setAuthChecked(true); }
  }, []);
  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    try { setAppPublicSettings(await base44.app.getPublicSettings()); } catch { setAppPublicSettings({}); }
    await checkUserAuth();
  }, [checkUserAuth]);
  useEffect(() => { checkAppState(); }, [checkAppState]);
  useEffect(() => {
    let redirecting = false;
    const handleExpiredSession = () => {
      if (redirecting || window.location.pathname === '/login') return;
      redirecting = true;
      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    };
    window.addEventListener('school:session-expired', handleExpiredSession);
    return () => window.removeEventListener('school:session-expired', handleExpiredSession);
  }, []);
  const logout = (shouldRedirect = true) => { setUser(null); setIsAuthenticated(false); base44.auth.logout(shouldRedirect ? '/login' : null); };
  const navigateToLogin = () => { window.location.href = '/login'; };
  return <AuthContext.Provider value={{ user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, appPublicSettings, authChecked, logout, navigateToLogin, checkUserAuth, checkAppState }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within an AuthProvider'); return context; };
