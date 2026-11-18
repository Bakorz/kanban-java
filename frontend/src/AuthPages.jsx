import { useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { configurationNotice, safeRedirect, useAuth } from './Auth.jsx';
import { ErrorMessage, useOperation } from './ui.jsx';
import './auth.css';

const titles = { login: 'Log in to Kanban', register: 'Create a Kanban account', forgot: 'Reset your Kanban password', reset: 'Choose a new Kanban password', callback: 'Authentication callback' };
const documentTitles = { login: 'Log in', register: 'Create an account', forgot: 'Reset your password', reset: 'Choose a new password', callback: 'Authentication callback' };
const formLabels = { login: 'Log in', register: 'Create an account', forgot: 'Reset your password', reset: 'Choose a new password', callback: 'Authentication callback' };
const leads = {
  login: 'Back to your 3-column board.',
  register: 'Your boards, 3 columns, one clear next step.',
  forgot: 'Enter the email on your account and we will send a recovery link.',
  reset: 'Choose a new password for your account.',
};
const submitLabels = { login: 'Log in', register: 'Create account', forgot: 'Send recovery link', reset: 'Update password' };
const pendingLabels = { login: 'Signing in…', register: 'Creating your account…', forgot: 'Sending the recovery link…', reset: 'Updating your password…' };

function BrandMark() {
  return <span className="auth-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function Arrow() {
  return <svg className="auth-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h8M4.5 2.5 8 6l-3.5 3.5" /></svg>;
}

function GoogleMark() {
  return <svg className="auth-google__mark" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
  </svg>;
}

function AuthFrame({ title, documentTitle = title, lead, children }) {
  const heading = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${documentTitle} | Kanban`;
    heading.current?.focus();
    document.body.classList.add('auth-body');
    return () => document.body.classList.remove('auth-body');
  }, [title, documentTitle, pathname]);
  return <main className="auth-main">
    <div className="auth-stage">
      <section className="auth-card" aria-labelledby="content">
        <div className="auth-card__top">
          <span className="auth-card__brand"><BrandMark />Kanban</span>
          <span className="auth-card__eyebrow">Personal boards</span>
        </div>
        <h1 id="content" ref={heading} tabIndex={-1}>{title}</h1>
        {lead && <p className="auth-lead">{lead}</p>}
        {children}
      </section>
    </div>
  </main>;
}

function GoogleButton({ kind }) {
  return <>
    <button className="auth-google" type="button" disabled>
      <GoogleMark />
      <span>{kind === 'register' ? 'Sign up with Google' : 'Sign in with Google'}</span>
      <span className="auth-google__soon">Soon</span>
    </button>
    <div className="auth-divider"><span>or continue with email</span></div>
  </>;
}

function AuthSwitch({ kind, message, session }) {
  if (message && session) return <p className="auth-switch"><Link to="/dashboard">Return to my boards</Link></p>;
  if (kind === 'login') return <p className="auth-switch">New to Kanban? <Link to="/register">Create an account</Link></p>;
  if (kind === 'register') return <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>;
  if (kind === 'forgot') return <p className="auth-switch">Remembered it? <Link to="/login">Back to log in</Link></p>;
  return <p className="auth-switch"><Link to="/login">Back to log in</Link><span aria-hidden="true">·</span><Link to="/forgot-password">Request a new recovery link</Link></p>;
}

export function AuthPage({ kind }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const op = useOperation();
  const ids = useId();
  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const next = safeRedirect(new URLSearchParams(location.search).get('next'));
  const title = titles[kind];
  if (kind === 'callback') return <Callback next={next} />;
  if (auth.loading) return <AuthFrame title={title} documentTitle={documentTitles[kind]}><div className="auth-loading"><progress aria-label="Loading authentication" /><p>Checking your session…</p></div></AuthFrame>;
  if (kind === 'login' && auth.session && !auth.recovery) return <Navigate to={next} replace />;
  const allowedReset = kind !== 'reset' || (auth.recovery && auth.session);
  async function submit(event) {
    event.preventDefault();
    if (!auth.client || !allowedReset) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    await op.run(async () => {
      setMessage('');
      if (kind === 'login') {
        const { error } = await auth.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next, { replace: true });
      } else if (kind === 'register') {
        const { data, error } = await auth.client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        if (data.session) navigate('/dashboard', { replace: true });
        else setMessage('Check your email to confirm your account, then log in. No workspace is available until your email is confirmed.');
      } else if (kind === 'forgot') {
        // Always use a neutral response, including provider errors, to avoid account enumeration.
        try { await auth.client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); } catch { /* neutral by design */ }
        setMessage('If an account exists for this email, you will receive a password recovery link. Check your inbox and spam folder.');
      } else if (kind === 'reset') {
        if (!auth.recovery || !auth.session) throw new Error('Open a valid recovery link before changing your password.');
        const { error } = await auth.client.auth.updateUser({ password });
        if (error) throw error;
        auth.finishRecovery();
        setMessage('Your password has been updated. You can return to your boards.');
      }
    });
  }
  return <AuthFrame title={title} documentTitle={documentTitles[kind]} lead={leads[kind]}>
    {!auth.client ? <p className="notice auth-notice">{configurationNotice}</p> : <>
      {auth.error && <ErrorMessage error={auth.error} />}
      {!allowedReset && !message ? <p className="notice auth-notice">Open a valid password recovery link from your email. A normal signed-in session cannot reset your password here.</p> : !message && <form method="post" onSubmit={submit} aria-label={formLabels[kind]} className="auth-form">
        {(kind === 'login' || kind === 'register') && <GoogleButton kind={kind} />}
        {kind !== 'reset' && <div className="field auth-field">
          <label htmlFor={emailId}>Email (required)</label>
          <input id={emailId} name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={254} disabled={op.pending} />
        </div>}
        {kind !== 'forgot' && <div className="field auth-field">
          <div className="auth-field__head">
            <label htmlFor={passwordId}>{kind === 'reset' ? 'New password (required)' : 'Password (required)'}</label>
            {kind === 'login' && <Link className="auth-field__link" to="/forgot-password">Forgot password?</Link>}
          </div>
          <div className="auth-field__control">
            <input id={passwordId} name="password" aria-describedby={kind === 'login' ? undefined : 'password-hint'} type={showPassword ? 'text' : 'password'} autoComplete={kind === 'login' ? 'current-password' : 'new-password'} minLength={kind === 'login' ? undefined : 8} required disabled={op.pending} />
            <button className="auth-reveal" type="button" aria-pressed={showPassword} aria-controls={passwordId} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          {kind !== 'login' && <p id="password-hint" className="auth-hint">Use at least 8 characters.</p>}
        </div>}
        <ErrorMessage error={op.error} />
        <button className="auth-submit" type="submit" disabled={op.pending}>{op.pending ? 'Please wait…' : submitLabels[kind]}{!op.pending && <Arrow />}</button>
        <p className="auth-form__status" role="status" aria-live="polite">{op.pending ? pendingLabels[kind] : ''}</p>
      </form>}
      {message && <p className="notice auth-notice" role="status">{message}</p>}
    </>}
    <AuthSwitch kind={kind} message={message} session={auth.session} />
  </AuthFrame>;
}

function Callback({ next }) {
  const auth = useAuth();
  // detectSessionInUrl is enabled on the PKCE SDK client. getSession in the
  // provider waits for SDK initialization/exchange; do not exchange the code twice.
  if (auth.loading) return <AuthFrame title={titles.callback}><div className="auth-loading"><progress aria-label="Verifying authentication link" /><p>Verifying your link…</p></div></AuthFrame>;
  if (auth.recovery && auth.session) return <Navigate to="/reset-password" replace />;
  if (auth.session && !auth.error) return <Navigate to={next === '/reset-password' ? '/dashboard' : next} replace />;
  return <AuthFrame title={titles.callback} lead="This link may have expired or already been used.">
    <ErrorMessage error={auth.error} />
    <p className="notice auth-notice">{auth.client ? 'This authentication link could not be verified or has expired. Try logging in or request a new recovery link.' : configurationNotice}</p>
    <p className="auth-switch"><Link to="/login">Back to log in</Link><span aria-hidden="true">·</span><Link to="/forgot-password">Request a new recovery link</Link></p>
  </AuthFrame>;
}
