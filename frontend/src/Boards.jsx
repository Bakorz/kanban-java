import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createApi } from './api.js';
import { useAuth } from './Auth.jsx';
import { ConfirmDelete, ErrorMessage, Field, Page, useOperation } from './ui.jsx';

function useApi() {
  const { client, clear, getScope } = useAuth();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // getScope is a stable ref accessor updated synchronously by SDK auth events,
  // so requests cannot outlive an account switch even before React re-renders.
  return useMemo(() => createApi({ client, onAuthFailure: clear, getScope, isActive: () => active.current }), [client, clear, getScope]);
}
function useResource(path) {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(null);
    try { const result = await api(path); if (sequence.current === current) setData(result); return result; }
    catch (err) { if (sequence.current === current) { setError(err); setData(null); } throw err; }
    finally { if (sequence.current === current) setLoading(false); }
  }, [api, path]);
  useEffect(() => { void load().catch(() => {}); return () => { sequence.current++; }; }, [load]);
  return { api, data, error, loading, load };
}
function ResourceState({ resource, children }) {
  if (resource.loading && !resource.data) return <progress aria-label="Loading workspace" />;
  if (resource.error) return <><ErrorMessage error={resource.error} /><button type="button" onClick={() => { void resource.load().catch(() => {}); }}>Try again</button></>;
  return children;
}

function BoardForm({ board, onSave, onCancel, onBusy, formBusy = false }) {
  const op = useOperation();
  useEffect(() => { onBusy?.(op.pending); return () => onBusy?.(false); }, [op.pending, onBusy]);
  const title = board ? 'Edit board' : 'Create board';
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <form className="editor" method="post" aria-label={title} onSubmit={(event) => {
    event.preventDefault();
    if (formBusy) return;
    const form = new FormData(event.currentTarget);
    void op.run(() => onSave({ name: String(form.get('name')).trim(), description: String(form.get('description')).trim() || null }));
  }}><h2 ref={heading} tabIndex={-1}>{title}</h2>
    <Field label="Board name (required)" name="name" required maxLength={100} pattern=".*\S.*" defaultValue={board?.name || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.name} />
    <Field label="Description (optional, up to 2,000 characters)" name="description" multiline maxLength={2000} defaultValue={board?.description || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.description} />
    <ErrorMessage error={op.error} />
    <div className="actions"><button type="submit" className="primary" disabled={op.pending || formBusy}>{op.pending ? 'Saving…' : board ? 'Save board' : 'Create board'}</button><button type="button" disabled={op.pending || formBusy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

export function Dashboard() {
  const resource = useResource('/api/boards');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const op = useOperation();
  return <Page title="My boards"><p className="intro">Keep your work moving, one task at a time.</p>
    {!editing && <button type="button" className="primary" disabled={op.pending || resource.loading || !!resource.error} onClick={() => { setDeleting(null); setEditing({}); }}>New board</button>}
    {editing && <BoardForm onBusy={setFormBusy} formBusy={op.pending} key={editing.id || 'new'} board={editing.id ? editing : null} onCancel={() => setEditing(null)} onSave={async (payload) => {
      await resource.api(editing.id ? `/api/boards/${editing.id}` : '/api/boards', { method: editing.id ? 'PUT' : 'POST', body: payload });
      setEditing(null);
      await resource.load().catch(() => {}); // Mutation is committed: retry only the GET, never the create form.
    }} />}
    <ErrorMessage error={op.error} />
    {deleting && <ConfirmDelete board name={deleting.name} pending={op.pending || formBusy} onCancel={() => setDeleting(null)} onConfirm={() => { void op.run(async () => { await resource.api(`/api/boards/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); await resource.load(); }); }} />}
    <section className="board-section"><h2>Your workspace</h2><ResourceState resource={resource}>
      {resource.data?.boards?.length === 0 && <p>No boards yet. Create your first board to start organizing tasks.</p>}
      <ul className="board-list" role="list">{resource.data?.boards?.map((board) => <li className="board-item" key={board.id}><h3><Link to={`/boards/${board.id}`}>{board.name}</Link></h3>{board.description && <p className="preserve-text">{board.description}</p>}<div className="actions"><button type="button" disabled={formBusy || op.pending} aria-label={`Edit board ${board.name}`} onClick={() => { setDeleting(null); setEditing(board); }}>Edit board</button><button type="button" disabled={formBusy || op.pending} aria-label={`Delete board ${board.name}`} onClick={() => { setEditing(null); setDeleting(board); }}>Delete board</button></div></li>)}</ul>
    </ResourceState></section>
  </Page>;
}

function CardForm({ card, column, onSave, onCancel, onBusy, formBusy = false }) {
  const op = useOperation();
  useEffect(() => { onBusy?.(op.pending); return () => onBusy?.(false); }, [op.pending, onBusy]);
  const priorityId = `priority-${card?.id || column.id}`;
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <form className="editor" aria-label={card ? `Edit card ${card.title}` : `Add card to ${column.name}`} method="post" onSubmit={(event) => {
    event.preventDefault(); if (formBusy) return; const form = new FormData(event.currentTarget);
    const body = { title: String(form.get('title')).trim(), description: String(form.get('description')).trim() || null, priority: String(form.get('priority')), dueDate: String(form.get('dueDate')) || null };
    void op.run(() => onSave(body));
  }}><h2 ref={heading} tabIndex={-1}>{card ? 'Edit card' : `Add card to ${column.name}`}</h2>
    <Field label="Title (required)" name="title" required maxLength={200} pattern=".*\S.*" defaultValue={card?.title || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.title} />
    <Field label="Description (optional, up to 5,000 characters)" name="description" multiline maxLength={5000} defaultValue={card?.description || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.description} />
    <div className="field"><label htmlFor={priorityId}>Priority</label><select id={priorityId} name="priority" defaultValue={card?.priority || 'MEDIUM'} disabled={op.pending || formBusy}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
    <Field label="Due date (optional)" name="dueDate" type="date" defaultValue={card?.dueDate || ''} disabled={op.pending || formBusy} error={op.error?.fieldErrors?.dueDate} />
    <ErrorMessage error={op.error} /><div className="actions"><button className="primary" type="submit" disabled={op.pending || formBusy}>{op.pending ? 'Saving…' : card ? 'Save card' : 'Create card'}</button><button type="button" disabled={op.pending || formBusy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

function Card({ card, column, columns, index, busy, onEdit, onDelete, onMove }) {
  const [target, setTarget] = useState(column.id);
  const selectId = `move-${card.id}`;
  useEffect(() => setTarget(column.id), [column.id]);
  return <article className="card"><h3>{card.title}</h3>{card.description && <p className="preserve-text">{card.description}</p>}
    <p className="card-meta">Priority: {card.priority.toLowerCase()}{card.dueDate && <> · Due <time dateTime={card.dueDate}>{card.dueDate}</time></>}</p>
    <div className="actions"><button type="button" disabled={busy} aria-label={`Edit card ${card.title}`} onClick={onEdit}>Edit</button><button type="button" disabled={busy} aria-label={`Delete card ${card.title}`} onClick={onDelete}>Delete</button></div>
    <form className="move-form" aria-label={`Move ${card.title}`} onSubmit={(event) => { event.preventDefault(); if (!busy && target !== column.id) onMove(target, columns.find((c) => c.id === target).cards.length); }}>
      <label htmlFor={selectId}>Move to column</label><select id={selectId} value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="submit" disabled={busy || target === column.id} aria-label={`Move ${card.title} to selected column`}>Move</button>
    </form>
    <div className="actions reorder"><button type="button" disabled={busy || index === 0} aria-label={`Move ${card.title} up`} onClick={() => onMove(column.id, index - 1)}>Move up</button><button type="button" disabled={busy || index === column.cards.length - 1} aria-label={`Move ${card.title} down`} onClick={() => onMove(column.id, index + 1)}>Move down</button></div>
  </article>;
}

export function Board() {
  const { boardId } = useParams();
  const resource = useResource(`/api/boards/${encodeURIComponent(boardId)}`);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [editingBoard, setEditingBoard] = useState(false);
  const [status, setStatus] = useState('');
  const op = useOperation();
  const navigate = useNavigate();
  const board = resource.data?.board;
  const columns = resource.data?.columns || [];
  async function mutate(path, options, message) {
    setStatus(''); await resource.api(path, options); setEditor(null); setDeleting(null);
    try { await resource.load(); setStatus(message); }
    catch { setStatus('The change was saved, but the latest board could not be loaded. Use Try again to reload; do not repeat the change.'); }
  }
  return <Page title={board?.name || 'Board'}><p><Link to="/dashboard">Back to my boards</Link></p><p role="status">{status}</p><ResourceState resource={resource}>
    {board && <>
      {board.description && <p className="intro preserve-text">{board.description}</p>}
      <div className="actions"><button type="button" disabled={op.pending || formBusy || resource.loading} onClick={() => { setEditingBoard(true); setEditor(null); }}>Edit board</button><button type="button" disabled={op.pending || formBusy || resource.loading} onClick={() => setDeleting({ type: 'board', ...board })}>Delete board</button></div>
      {editingBoard && <BoardForm onBusy={setFormBusy} formBusy={op.pending} board={board} onCancel={() => setEditingBoard(false)} onSave={async (body) => { await resource.api(`/api/boards/${board.id}`, { method: 'PUT', body }); setEditingBoard(false); await resource.load().catch(() => {}); }} />}
      <ErrorMessage error={op.error} />
      {deleting && <ConfirmDelete board={deleting.type === 'board'} name={deleting.title || deleting.name} pending={op.pending || formBusy} onCancel={() => setDeleting(null)} onConfirm={() => { void op.run(async () => {
        if (deleting.type === 'board') { await resource.api(`/api/boards/${board.id}`, { method: 'DELETE' }); navigate('/dashboard'); }
        else await mutate(`/api/cards/${deleting.id}`, { method: 'DELETE' }, 'Card deleted.');
      }); }} />}
      {editor && <CardForm onBusy={setFormBusy} formBusy={op.pending} key={editor.card?.id || editor.column.id} card={editor.card} column={editor.column} onCancel={() => setEditor(null)} onSave={async (body) => {
        await mutate(editor.card ? `/api/cards/${editor.card.id}` : `/api/columns/${editor.column.id}/cards`, { method: editor.card ? 'PUT' : 'POST', body }, editor.card ? 'Card updated.' : 'Card created.');
      }} />}
      <section className="board-section"><h2>Board columns</h2><p>Use the column selector or Move up / Move down to organize cards. No dragging required.</p><div className="columns">{columns.map((column) => <section className="column" key={column.id}><h2>{column.name} <span className="count">({column.cards.length})</span></h2><button type="button" disabled={op.pending || formBusy || resource.loading} onClick={() => { setEditingBoard(false); setEditor({ column }); }}>Add card to {column.name}</button>
        {!column.cards.length && <p className="column-empty">No cards yet.</p>}
        <ol className="card-list" role="list">{column.cards.map((card, index) => <li key={card.id}><Card card={card} column={column} columns={columns} index={index} busy={op.pending || formBusy || resource.loading} onEdit={() => { setEditingBoard(false); setEditor({ column, card }); }} onDelete={() => setDeleting({ type: 'card', ...card })} onMove={(targetColumnId, newPosition) => { void op.run(() => mutate(`/api/cards/${card.id}/move`, { method: 'POST', body: { targetColumnId, newPosition } }, 'Card moved.')); }} /></li>)}</ol>
      </section>)}</div></section>
    </>}
  </ResourceState></Page>;
}
