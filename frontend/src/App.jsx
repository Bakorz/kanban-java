import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { checkHealth } from './health.js';
import { AuthProvider, useAuth } from './Auth.jsx';
import { AuthPage } from './AuthPages.jsx';
import { Board, Dashboard } from './Boards.jsx';
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


function Preview() {
  return <Page title="Board preview"><p className="intro">Keep your work moving, one task at a time.</p>
    <p className="notice">Public layout preview only. No board has been created, no cards are saved, and this is not a signed-in workspace.</p>
    <p><Link className="button primary" to="/login">Log in to manage your boards</Link></p>
    <section className="board-section"><h2>Three stages, a clear next step</h2><div className="columns">{[
      ['To Do', 'Tasks waiting to be started.'], ['In Progress', 'The work you are focusing on.'], ['Done', 'Completed work stays here.'],
    ].map(([name, description]) => <section className="column" key={name}><h3>{name}</h3><p>{description}</p><p className="column-empty">No cards in this preview.</p></section>)}</div></section>
    <HealthCheck />
  </Page>;
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
  return <>
    <a className="skip-link" href="#content">Skip to main content</a>
    <header className="app-header"><Link className="brand" to="/dashboard">Kanban</Link>
      <nav aria-label="Primary"><NavLink to="/dashboard">My boards</NavLink><NavLink to="/preview">Preview</NavLink>
        {auth.session ? <button type="button" disabled={op.pending} onClick={() => { void op.run(async () => { const { error } = await auth.client.auth.signOut(); if (error) throw error; }); }}>{op.pending ? 'Logging out…' : 'Log out'}</button> : <NavLink to="/login">Log in</NavLink>}
      </nav>
    </header>
    <ErrorMessage error={op.error} />
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/preview" element={<Preview />} />
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
    <footer className="app-footer">Personal Kanban · Your boards, one task at a time</footer>
  </>;
}
export function App({ authClient }) { return <AuthProvider {...(authClient !== undefined ? { client: authClient } : {})}><Shell /></AuthProvider>; }
