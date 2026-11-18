import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Page({ title, children, className, back, actions }) {
  const heading = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { document.title = `${title} | Kanban`; heading.current?.focus(); }, [title, pathname]);
  const titleHeading = <h1 id="content" ref={heading} tabIndex={-1}>{title}</h1>;
  return <main className={className}>
    {back || actions
      ? <div className="page-heading">
        <div className="page-heading__text">
          {back && <Link className="page-back" to={back.to}>{back.label}</Link>}
          {titleHeading}
        </div>
        {actions && <div className="page-heading__actions">{actions}</div>}
      </div>
      : titleHeading}
    {children}
  </main>;
}

export function WorkspaceLoading({ label }) {
  const labelId = useId();
  return <div className="workspace-loading">
    <span id={labelId}>{label}</span>
    <progress aria-labelledby={labelId} />
  </div>;
}

export function Modal({ labelledBy, onClose, children, panelClassName = '' }) {
  const panel = useRef(null);
  const returnTo = useRef(null);
  useEffect(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const autofocus = panel.current?.querySelector('[data-autofocus]') || panel.current?.querySelector(FOCUSABLE);
    autofocus?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (returnTo.current?.isConnected) returnTo.current.focus();
      else document.getElementById('content')?.focus();
    };
  }, []);
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const candidates = [...(panel.current?.querySelectorAll(FOCUSABLE) || [])];
    if (!candidates.length) { event.preventDefault(); panel.current?.focus(); return; }
    const active = document.activeElement;
    if (!candidates.includes(active)) {
      event.preventDefault();
      (event.shiftKey ? candidates[candidates.length - 1] : candidates[0]).focus();
    } else if (!event.shiftKey && active === candidates[candidates.length - 1]) {
      event.preventDefault(); candidates[0].focus();
    } else if (event.shiftKey && active === candidates[0]) {
      event.preventDefault(); candidates[candidates.length - 1].focus();
    }
  }
  return <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal-panel${panelClassName ? ` ${panelClassName}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={panel} tabIndex={-1} onKeyDown={onKeyDown}>{children}</div>
  </div>;
}

export function ErrorMessage({ error }) {
  const ref = useRef(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  if (!error) return null;
  return <div className="error notice" role="alert" ref={ref} tabIndex={-1}><p>{error.message || error}</p>
    {error.fieldErrors && <ul>{Object.entries(error.fieldErrors).map(([field, messages]) => <li key={field}>{field}: {Array.isArray(messages) ? messages.join(', ') : String(messages)}</li>)}</ul>}
  </div>;
}
export function Field({ label, name, multiline = false, error, ...props }) {
  const id = useId();
  const Tag = multiline ? 'textarea' : 'input';
  return <div className="field"><label htmlFor={id}>{label}</label><Tag id={id} name={name} {...props} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : props['aria-describedby']} />{error && <span id={`${id}-error`}>{Array.isArray(error) ? error.join(', ') : String(error)}</span>}</div>;
}
export function useOperation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(false);
  async function run(action) {
    if (lock.current) return false;
    lock.current = true; setPending(true); setError(null);
    try { await action(); return true; }
    catch (err) { setError(err); return false; }
    finally { lock.current = false; setPending(false); }
  }
  return { pending, error, run };
}
