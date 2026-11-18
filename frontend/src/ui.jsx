import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function Page({ title, children, className }) {
  const heading = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { document.title = `${title} | Kanban`; heading.current?.focus(); }, [title, pathname]);
  return <main className={className}><h1 id="content" ref={heading} tabIndex={-1}>{title}</h1>{children}</main>;
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

export function ConfirmDelete({ name, pending, onConfirm, onCancel, board = false }) {
  const cancel = useRef(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  return <div className="notice confirmation"><p>Delete “{name}”? {board ? 'All columns and cards in this board will also be deleted. ' : ''}This cannot be undone.</p><div className="actions"><button type="button" ref={cancel} disabled={pending} onClick={onCancel}>Cancel deletion</button><button type="button" className="danger" disabled={pending} onClick={onConfirm}>{pending ? 'Deleting…' : 'Confirm delete'}</button></div></div>;
}
