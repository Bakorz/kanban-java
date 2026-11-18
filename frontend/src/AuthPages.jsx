import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { configurationNotice, safeRedirect, useAuth } from './Auth.jsx';
import { ErrorMessage, Field, Page, useOperation } from './ui.jsx';

const titles = { login: 'Log in', register: 'Create an account', forgot: 'Reset your password', reset: 'Choose a new password', callback: 'Authentication callback' };

export function AuthPage({ kind }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const op = useOperation();
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const next = safeRedirect(new URLSearchParams(location.search).get('next'));
  const title = titles[kind];
  if (kind === 'callback') return <Callback next={next} />;
  if (auth.loading) return <Page title={title}><progress aria-label="Loading authentication" /></Page>;
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
  return <Page title={title}><div className="auth-content">
    {!auth.client ? <p className="notice">{configurationNotice}</p> : <>
      {auth.error && <ErrorMessage error={auth.error} />}
      {!allowedReset && !message ? <p className="notice">Open a valid password recovery link from your email. A normal signed-in session cannot reset your password here.</p> : !message && <form method="post" onSubmit={submit} aria-label={title}>
        {kind !== 'reset' && <Field label="Email (required)" name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={254} disabled={op.pending} />}
        {kind !== 'forgot' && <>
          {kind !== 'login' && <p id="password-hint">Use at least 8 characters. Your authentication provider may require a stronger password.</p>}
          <Field label={kind === 'reset' ? 'New password (required)' : 'Password (required)'} name="password" aria-describedby={kind === 'login' ? undefined : 'password-hint'} type={showPassword ? 'text' : 'password'} autoComplete={kind === 'login' ? 'current-password' : 'new-password'} minLength={kind === 'login' ? undefined : 8} required disabled={op.pending} />
          <button className="password-toggle" type="button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show password'}</button>
        </>}
        <ErrorMessage error={op.error} />
        <button className="primary" type="submit" disabled={op.pending}>{op.pending ? 'Please wait…' : ({ login: 'Log in', register: 'Create account', forgot: 'Send recovery link', reset: 'Update password' })[kind]}</button>
      </form>}
      {message && <p className="notice" role="status">{message}</p>}
    </>}
    <nav aria-label="Account">
      {kind !== 'login' && <Link to="/login">Back to log in</Link>}
      {kind === 'login' && <Link to="/register">Create an account</Link>}
      {(kind === 'login' || kind === 'reset') && <Link to="/forgot-password">{kind === 'reset' ? 'Request a new recovery link' : 'Forgot password?'}</Link>}
      {message && auth.session && <Link to="/dashboard">Return to my boards</Link>}
      <Link to="/">Home</Link>
    </nav>
  </div></Page>;
}

function Callback({ next }) {
  const auth = useAuth();
  // detectSessionInUrl is enabled on the PKCE SDK client. getSession in the
  // provider waits for SDK initialization/exchange; do not exchange the code twice.
  if (auth.loading) return <Page title={titles.callback}><progress aria-label="Verifying authentication link" /></Page>;
  if (auth.recovery && auth.session) return <Navigate to="/reset-password" replace />;
  if (auth.session && !auth.error) return <Navigate to={next === '/reset-password' ? '/dashboard' : next} replace />;
  return <Page title={titles.callback}><ErrorMessage error={auth.error} /><p className="notice">{auth.client ? 'This authentication link could not be verified or has expired. Try logging in or request a new recovery link.' : configurationNotice}</p><p><Link to="/login">Back to log in</Link></p><Link to="/forgot-password">Request a new recovery link</Link></Page>;
}
