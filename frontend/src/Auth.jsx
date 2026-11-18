import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { authClient } from './supabase.js';

const AuthContext = createContext(null);
export const configurationNotice = 'Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your local frontend environment, then restart the dev server. Do not use a service-role key. You can still open the public preview.';

export function safeRedirect(value, fallback = '/dashboard') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try { const parsed = new URL(value, 'https://internal.invalid'); return parsed.origin === 'https://internal.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback; }
  catch { return fallback; }
}

export function AuthProvider({ children, client = authClient }) {
  const [state, setState] = useState({ session: null, loading: !!client, recovery: false, error: '', generation: 0 });
  const identity = useRef(null);
  const clear = useCallback((message = 'Your session has expired. Please log in again.') => {
    identity.current = null;
    setState((s) => ({ session: null, recovery: false, loading: false, error: message, generation: s.generation + 1 }));
    // Only the SDK owns persistent authentication storage.
    if (client) void client.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [client]);
  useEffect(() => {
    if (!client) { setState((s) => ({ ...s, loading: false })); return; }
    let active = true;
    let observed = false;
    function accept(event, session) {
      if (!active) return;
      const id = session?.user?.id ?? null;
      const changed = identity.current !== id;
      identity.current = id;
      setState((s) => ({ session, loading: false, error: '', generation: s.generation + (changed || event === 'SIGNED_OUT' ? 1 : 0), recovery: event === 'PASSWORD_RECOVERY' ? !!session : (event === 'SIGNED_OUT' || changed ? false : s.recovery) }));
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => { observed = true; accept(event, session); });
    client.auth.getSession().then(({ data, error }) => {
      if (!active || observed) return;
      if (error) setState((s) => ({ ...s, loading: false, error: error.message }));
      else accept('INITIAL_SESSION', data.session);
    }).catch(() => { if (active) setState((s) => ({ ...s, loading: false, error: 'Could not load your session. Please try logging in again.' })); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  const finishRecovery = () => setState((s) => ({ ...s, recovery: false }));
  return <AuthContext.Provider value={{ ...state, client, clear, finishRecovery }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
