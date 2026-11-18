import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { checkHealth } from './health.js';

const columns = [
  { name: 'To Do', description: 'Tasks waiting to be started.' },
  { name: 'In Progress', description: 'The work you are focusing on.' },
  { name: 'Done', description: 'Completed work stays here.' },
];

function Page({ title, children }) {
  const heading = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${title} | Kanban`;
    heading.current?.focus();
  }, [title, pathname]);
  return <main><h1 id="content" ref={heading} tabIndex={-1}>{title}</h1>{children}</main>;
}

function Columns() {
  return <div className="columns">{columns.map(({ name, description }) =>
    <section className="column" key={name}>
      <h3>{name}</h3>
      <p>{description}</p>
      <p className="column-empty">No cards in this preview.</p>
    </section>,
  )}</div>;
}

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

function Dashboard() {
  return <Page title="My boards">
    <p className="intro">Keep your work moving, one task at a time.</p>
    <div className="notice"><strong>Foundation preview</strong><p>Authentication and saved boards are not connected yet. This is a public scaffold, not a signed-in workspace.</p></div>
    <section className="board-section"><h2>Your workspace</h2>
      <p>No persisted boards are loaded. Board creation will be available after authentication and the Java board API are implemented.</p>
      <Link className="button primary" to="/boards/preview">Open board preview</Link>
    </section>
    <section className="board-section"><h2>Three stages, a clear next step</h2>
      <p>Every board will start with these fixed columns. The layout below is a preview, not saved data.</p><Columns />
    </section>
    <HealthCheck />
  </Page>;
}

const authPages = {
  login: { title: 'Log in', description: 'Supabase sign-in is not connected yet. No credentials are collected by this preview.', links: [['/register', 'Create an account'], ['/forgot-password', 'Forgot password?']] },
  register: { title: 'Create an account', description: 'Registration and email confirmation will be connected to Supabase Auth. Account creation is not available in this preview.', links: [['/login', 'Back to log in']] },
  forgot: { title: 'Reset your password', description: 'Recovery email delivery is not connected yet. This preview cannot send password reset emails.', links: [['/login', 'Back to log in']] },
  reset: { title: 'Choose a new password', description: 'Recovery session verification and password updates are not implemented yet. This preview does not read or exchange recovery tokens.', links: [['/forgot-password', 'Request a new recovery link']] },
  callback: { title: 'Authentication callback', description: 'Confirmation and authentication callbacks are not connected yet. This preview does not read or exchange authentication tokens.', links: [['/login', 'Back to log in']] },
};

function AuthPlaceholder({ page }) {
  const { title, description, links } = authPages[page];
  return <Page title={title}><div className="auth-content"><p className="intro">{description}</p>
    <p className="notice">Authentication is not available in this foundation build.</p>
    <nav aria-label="Account">{links.map(([to, text]) => <Link key={to} to={to}>{text}</Link>)}</nav>
    <Link to="/dashboard">Return to workspace preview</Link>
  </div></Page>;
}

function BoardPreview() {
  const { boardId } = useParams();
  const preview = boardId === 'preview';
  return <Page title={preview ? 'Board preview' : 'Board unavailable'}>
    <p><Link to="/dashboard">Back to my boards</Link></p>
    {preview ? <>
      <p className="intro">A place for your next task.</p>
      <p className="notice">Layout preview only. No board has been created, no cards are saved, and editing is not connected.</p>
      <section className="board-section"><h2>Preview columns</h2><Columns /></section>
    </> : <p className="notice">Board data is not connected yet. This scaffold does not load or authorize access to board IDs.</p>}
  </Page>;
}

export function App() {
  return <>
    <a className="skip-link" href="#content">Skip to main content</a>
    <header className="app-header"><Link className="brand" to="/dashboard">Kanban</Link>
      <nav aria-label="Primary"><NavLink to="/dashboard">My boards</NavLink><NavLink to="/login">Log in</NavLink></nav>
    </header>
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/boards/:boardId" element={<BoardPreview />} />
      <Route path="/login" element={<AuthPlaceholder page="login" />} />
      <Route path="/register" element={<AuthPlaceholder page="register" />} />
      <Route path="/forgot-password" element={<AuthPlaceholder page="forgot" />} />
      <Route path="/reset-password" element={<AuthPlaceholder page="reset" />} />
      <Route path="/auth/reset-password" element={<AuthPlaceholder page="reset" />} />
      <Route path="/auth/callback" element={<AuthPlaceholder page="callback" />} />
      <Route path="*" element={<Page title="Page not found"><p>This page does not exist.</p><Link to="/dashboard">Return to my boards</Link></Page>} />
    </Routes>
    <footer className="app-footer">Personal Kanban · Development foundation · No saved application data</footer>
  </>;
}
