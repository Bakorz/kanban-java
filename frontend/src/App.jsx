import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { checkHealth } from './health.js';
import { AuthProvider, useAuth } from './Auth.jsx';
import { AuthPage } from './AuthPages.jsx';
import { Board, Dashboard } from './Boards.jsx';
import { Landing } from './Landing.jsx';
import { ErrorMessage, Page, useOperation } from './ui.jsx';

export function HealthCheck() {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function run() {
    if (pending.current) return;
    pending.current = true;
    setState('loading');
    setMessage('');
    try {
      await checkHealth();
      if (mounted.current) {
        setState('success');
        setMessage('Java API is reachable. Authentication and database connectivity are not checked.');
      }
    } catch (error) {
      if (mounted.current) {
        setState('error');
        setMessage(error.message);
      }
    } finally { pending.current = false; }
  }
  return <section className="connection">
    <div><h2>Java API connection</h2><p>Check that this frontend can reach the Java server through /api.</p></div>
    <button type="button" disabled={state === 'loading'} onClick={run}>
      {state === 'loading' ? 'Checking connection…' : 'Check connection'}
    </button>
    {state === 'loading' && <progress aria-label="Checking Java API connection" />}
    <p className={`connection-result ${state}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
  </section>;
}


const AUTH_ROUTES = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/auth/reset-password', '/auth/callback']);

function BrandMark() {
  return <span className="brand__mark" aria-hidden="true"><i /><i /><i /></span>;
}

function Protected({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <Page title="Loading your workspace"><progress aria-label="Loading authentication" /></Page>;
  if (!auth.session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (auth.recovery) return <Navigate to="/reset-password" replace />;
  // User-scoped views unmount on account change / logout / auth failure.
  return <div key={`${auth.generation}:${location.pathname}`}>{children}</div>;
}
function Shell() {
  const auth = useAuth();
  const op = useOperation();
  const { pathname } = useLocation();
  const onAuth = AUTH_ROUTES.has(pathname);
  return <>
    <style>{'main h1[tabindex="-1"]:focus{outline:none;text-decoration:underline;text-decoration-color:#1d4ed8;text-decoration-thickness:2px;text-underline-offset:8px}'}</style>
    <a className="skip-link" href="#content">Skip to main content</a>
    <header className={`app-header${onAuth ? ' app-header--auth' : ''}`}><Link className="brand" to="/"><BrandMark />Kanban</Link>
      <nav aria-label={onAuth ? 'Account' : 'Primary'}>{onAuth ? <Link className="app-header__back" to="/">Back to home</Link> : <><NavLink to="/" end>Home</NavLink><NavLink to="/dashboard">My boards</NavLink>
        {auth.session ? <button type="button" disabled={op.pending} onClick={() => { void op.run(async () => { const { error } = await auth.client.auth.signOut(); if (error) throw error; }); }}>{op.pending ? 'Logging out…' : 'Log out'}</button> : <NavLink to="/login">Log in</NavLink>}</>}
      </nav>
    </header>
    <ErrorMessage error={op.error} />
    <Routes>
      <Route path="/preview" element={<Navigate to="/" replace />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/boards/:boardId" element={<Protected><Board /></Protected>} />
      <Route path="/login" element={<AuthPage key="login" kind="login" />} />
      <Route path="/register" element={<AuthPage key="register" kind="register" />} />
      <Route path="/forgot-password" element={<AuthPage key="forgot" kind="forgot" />} />
      <Route path="/reset-password" element={<AuthPage key="reset" kind="reset" />} />
      <Route path="/auth/reset-password" element={<AuthPage key="reset-alias" kind="reset" />} />
      <Route path="/auth/callback" element={<AuthPage key="callback" kind="callback" />} />
      <Route path="*" element={<Page title="Page not found"><p>This page does not exist.</p><Link to="/dashboard">Return to my boards</Link></Page>} />
    </Routes>
    <footer className={`app-footer${onAuth ? ' app-footer--auth' : ''}`}>Personal Kanban · Your boards, one task at a time</footer>
  </>;
}
export function App({ authClient }) {
  return <AuthProvider {...(authClient !== undefined ? { client: authClient } : {})}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  </AuthProvider>;
}
